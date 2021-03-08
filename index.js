var _ = {
	camelCase: require('lodash/camelCase'),
	mapValues: require('lodash/mapValues'),
};

var csvParser = require('csv-parse');
var csvOutput = require('csv-stringify');

var parse = function(data, options) {
	var settings = {
		defaultType: 'report',
		delimiter: ',',
		...options,
	};

	var parser = csvParser({
		columns: header => header.map(col => _.camelCase(col)),
		delimiter: settings.delimiter,
	});

	parser.on('readable', ()=> {
		var ref;
		while (ref = parser.read()) {
			parser.emit('ref', ref);
		}
	});

	setTimeout(()=> { // Queue worker in a timeout so we can return this eventEmitter
		if (typeof data == 'string' || Buffer.isBuffer(data)) {
			parser.write(data, ()=> parser.end());
		} else {
			data.pipe(parser);
		}
	})

	return parser;
};

var output = function(options) {
	var settings = {
		content: undefined,
		delimiter: ',',
		header: true,
		fields: {
			'$default': val => Array.isArray(val) ? val.join(' and ') : val,
		},
		stream: undefined,
		...options,
	};

	var outputter = csvOutput({
		delimiter: settings.delimiter,
		header: settings.header,
		quoted_match: /[^a-z0-9 _+-=]/i, // Better CSV escaping that doesn't screw up with multi line weird Windows encoding
	});


	/**
	* Push a single reference, transforming fields as needed
	* @param {Object} refs The reference to push
	* @returns {Promise}
	*/
	var push = (ref, cb) => {
		outputter.write(
			_.mapValues(ref, (v, k) =>
				settings.fields[settings.fields[k] || '$default'](v, k)
			)
		, cb);
	};


	/**
	* Push an array of references in sequence
	* @param {array} refs The references to push
	* @returns {Promise}
	*/
	var pushArray = refs => {
		var promiseChain = Promise.resolve();
		refs.forEach(ref => promiseChain = promiseChain.then(()=>
			new Promise((resolve, reject) =>
				push(ref, err => {
					if (err) return reject(err);
					resolve();
				})
			)
		))
		return promiseChain;
	};

	var feedContent = ()=> {
		if (typeof settings.content == 'function') { // Callback
			settings.content((err, data) => {
				if (err) return outputter.emit('error', err);
				if (Array.isArray(data) && data.length > 0) { // Callback provided array
					pushArray(data).then(()=> setTimeout(feedContent));
				} else if(!Array.isArray(data) && typeof data == 'object') { // Callback provided single ref
					push(data).then(feedContent);
				} else { // End of stream
					outputter.end();
				}
			});
		} else if (Array.isArray(settings.content)) {
			pushArray(settings.content).then(()=> outputter.end());
		} else if (typeof settings.content == 'object') {
			push(settings.content).then(end);
		} else {
			outputter.end();
		}
	};

	setTimeout(()=> feedContent()); // Queue worker in a timeout so we can return this eventEmitter

	outputter.pipe(settings.stream);

	return outputter;
};

module.exports = {
	output: output,
	parse: parse,
};
