var expect = require('chai').expect;
var rl = require('../index');
var stream = require('stream');

describe('CSV output', function() {
	var refs = [
		{id: 'ref01', title: 'Hello World', authors: ['Joe Random', 'John Random'], volume: 1},
		{id: 'ref02', title: 'Goodbye World', authors: ['Josh Random', 'Janet Random'], volume: 2},
	];

	var validate;
	before('setup validator', ()=>
		validate = (data, done) => {
			expect(data).to.be.a('string');
			expect(data).to.have.length.above(10);
			expect(data).to.be.deep.equal(''
				+ 'id,title,authors,volume\n'
				+ 'ref01,Hello World,Joe Random and John Random,1\n'
				+ 'ref02,Goodbye World,Josh Random and Janet Random,2\n'
			);
			done();
		}
	);

	it('should generate CSV output from a collection', done => {
		// Setup fake stream {{{
		var output = '';
		var fakeStream = stream.Writable();
		fakeStream._write = (chunk, enc, next) => {
			output += chunk;
			next();
		};
		// }}}

		rl.output({
			content: refs,
			stream: fakeStream,
		})
			.on('end', ()=> validate(output, done))
	});

});
