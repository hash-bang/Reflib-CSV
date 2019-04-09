var _ = require('lodash');
var csvParser = require('csv-parse');
var csvOutput = require('csv-stringify');

var parse = function(data, options) {
	var settings = _.defaults(options, {
		defaultType: 'report',
		delimiter: ',',
	});

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
		if (_.isString(data) || _.isBuffer(data)) {
			parser.write(data, ()=> parser.end());
		} else {
			data.pipe(parser);
		}
	})

	return parser;
};

var output = function(options) {
	var settings = _.defaults(options, {
		content: undefined,
		delimiter: ',',
		header: true,
		fields: {
			'$default': val => _.isArray(val) ? val.join(' and ') : val,
		},
		stream: undefined,
	});

	var outputter = csvOutput({
		delimiter: settings.delimiter,
		header: settings.header,
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
		if (_.isFunction(settings.content)) { // Callback
			settings.content((err, data) => {
				if (err) return outputter.emit('error', err);
				if (_.isArray(data) && data.length > 0) { // Callback provided array
					pushArray(data).then(()=> setTimeout(feedContent));
				} else if(!_.isArray(data) && _.isObject(data)) { // Callback provided single ref
					push(data).then(feedContent);
				} else { // End of stream
					outputter.end();
				}
			});
		} else if (_.isArray(settings.content)) {
			pushArray(settings.content).then(()=> outputter.end());
		} else if (_.isObject(settings.content)) {
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
