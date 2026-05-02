import { PackrStream, UnpackrStream } from '../node-index.js'
import stream from 'stream'
import chai from 'chai'
import util from 'util'
import fs from 'fs'
let allSampleData = [];
for (let i = 1; i < 6; i++) {
	allSampleData.push(JSON.parse(fs.readFileSync(new URL(`./example${i > 1 ? i : ''}.json`, import.meta.url))));
}

const finished = util.promisify(stream.finished)
var assert = chai.assert

suite('msgpackr node stream tests', function(){
	test('serialize/parse stream', () => {
		const serializeStream = new PackrStream({
		})
		const parseStream = new UnpackrStream()
		serializeStream.pipe(parseStream)
		const received = []
		parseStream.on('data', data => {
			received.push(data)
		})
		const messages = [{
			name: 'first'
		}, {
			name: 'second'
		}, {
			name: 'third'
		}, {
			name: 'third',
			extra: [1, 3, { foo: 'hi'}, 'bye']
		}]
		for (const message of messages)
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				assert.deepEqual(received, messages)
				resolve()
			}, 10)
		})
	})
	test('stream from buffer', () => new Promise(async resolve => {
		const parseStream = new UnpackrStream()
		let values = []
		parseStream.on('data', (value) => {
			values.push(value)
		})
		parseStream.on('end', () => {
			assert.deepEqual(values, [1, 2])
			resolve()
		})
		let bufferStream = new stream.Duplex()
		bufferStream.pipe(parseStream)
		bufferStream.push(new Uint8Array([1, 2]))
		bufferStream.push(null)
	}))
	test('serialize stream to file', async function() {
		const serializeStream = new PackrStream({
		})
		const fileStream = fs.createWriteStream('test-output.msgpack');
		serializeStream.pipe(fileStream);
		const messages = [{
			name: 'first'
		}, {
			name: 'second',
			extra: [1, 3, { foo: 'hi'}, 'bye']
		}]
		for (const message of messages)
			serializeStream.write(message)
		setTimeout(() => serializeStream.end(), 10)
		
		await finished(serializeStream)
	})
	test('stream with records and bundleStrings', async function() {
		const serializeStream = new PackrStream({
			useRecords: true,
			bundleStrings: true,
		})
		const parseStream = new UnpackrStream()
		serializeStream.pipe(parseStream)
		const received = []
		parseStream.on('data', data => {
			received.push(data)
		})
		const messages = allSampleData;
		for (const message of messages)
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				assert.deepEqual(received, messages)
				resolve()
			}, 10)
		})
	})
	test('error when single incomplete chunk exceeds maxIncompleteBufferSize', () => new Promise((resolve, reject) => {
		// 0xaa = fixstr(10); only 3 bytes of string data follow — 4-byte incomplete remainder > limit of 3
		const parseStream = new UnpackrStream({ maxIncompleteBufferSize: 3 })
		parseStream.on('error', (error) => {
			assert.include(error.message, 'Maximum incomplete buffer size exceeded')
			resolve()
		})
		parseStream.on('data', () => {})
		parseStream.write(Buffer.from([0xaa, 0x61, 0x62, 0x63]))
	}))
	test('error when accumulated incomplete chunks exceed maxIncompleteBufferSize', () => new Promise((resolve, reject) => {
		// limit 3: first chunk leaves 3-byte remainder (ok), second chunk grows it to 5 bytes (error)
		const parseStream = new UnpackrStream({ maxIncompleteBufferSize: 3 })
		parseStream.on('error', (error) => {
			assert.include(error.message, 'Maximum incomplete buffer size exceeded')
			resolve()
		})
		parseStream.on('data', () => {})
		parseStream.write(Buffer.from([0xaa, 0x61, 0x62]))
		parseStream.write(Buffer.from([0x63, 0x64]))
	}))
	test('Infinity maxIncompleteBufferSize allows large buffering', () => new Promise((resolve, reject) => {
		// fixstr "hello" split across two chunks; Infinity limit should not error
		const parseStream = new UnpackrStream({ maxIncompleteBufferSize: Infinity })
		parseStream.on('error', reject)
		parseStream.on('data', (val) => {
			assert.equal(val, 'hello')
			resolve()
		})
		parseStream.write(Buffer.from([0xa5, 0x68]))
		parseStream.write(Buffer.from([0x65, 0x6c, 0x6c, 0x6f]))
	}))
	test('fragmented parse within limit completes successfully', () => new Promise((resolve, reject) => {
		// fixstr "hi" split across two chunks; 10-byte limit not exceeded
		const parseStream = new UnpackrStream({ maxIncompleteBufferSize: 10 })
		parseStream.on('error', reject)
		parseStream.on('data', (val) => {
			assert.equal(val, 'hi')
			resolve()
		})
		parseStream.write(Buffer.from([0xa2, 0x68]))
		parseStream.write(Buffer.from([0x69]))
	}))
	teardown(function() {
		try {
			fs.unlinkSync('test-output.msgpack')
		}catch(error){}
	})
})

