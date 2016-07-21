/**
 * @module taf
 * @exports Taf
 */

'use strict'

exports = module.exports = Taf

var fs       = require('fs'),
    path     = require('path'),
    assert   = require('assert'),
    equal    = assert.equal,
    resolve  = path.resolve,
    dirname  = path.dirname,
    inherits = require('util').inherits,
    EE       = require('events').EventEmitter,
    bytes    = require('bytes').parse

/**
 * Construct a `Taf` instance to monitor file changes line-by-line.
 *
 * todo: what about `[options.handleRename=true]`?
 *
 * @param {string} path - The file path to watch.
 * @param {number} [n=10] - Count of lines to read from the file before subscribing for changes. Same as '-n' param for `tail(1)`.
 * @param {object} [options] - Settings for this `Taf` instance plus options to pass to `fs.watch()`.
 * @param {number} [options.count=10] - Set `n` argument but via an options object.
 * @param {number|string} [options.bufferSize=1024] - Size of the read buffer to use. `bytes` module is used to parse the value.
 * todo: docs: Buffer size should be as close as possible to the expected average file change size to gain the best performance.
 * @returns {Taf}
 */
function Taf(path, n, options) {
    if (!(this instanceof Taf))
        return new Taf(path, n)

    assert(path, 'path is required')
    equal(typeof path, 'string', 'path must be a string')

    if (n === undefined)
        n = 10
    else if (typeof n === 'object') {
        options = n
        n       = Number(options.n) || Number(options.count) || 10
    }
    else
        equal(typeof n, 'number', 'n must be a number')

    if (!options)
        options = {
            bufferSize: 1024
        }
    else {
        if (options.encoding !== undefined)
            equal(options.encoding, 'utf8', 'only UTF-8 encoding is supported')

        if (options.bufferSize !== undefined) {
            var bs = options.bufferSize = bytes(options.bufferSize)
            assert(!isNaN(bs), 'invalid bufferSize provided')
        }
    }

    EE.call(this)

    this.path       = path
    this.count      = n
    this.options    = options
    this.bufferSize = options.bufferSize

    Object.defineProperty(this, '_size', {
        writable: true,
        value:    0
    })

    var self = this

    process.nextTick(function () {
        // stat the file to get its size
        fs.stat(path, function (err, stats) {
            if (err)
                return self.emit('error', err)

            // todo: the first line does not cause a 'line' event
            self._processFileChange(stats.size)
            self._setWatcher()
        })
    })
}

inherits(Taf, EE)

Object.defineProperties(Taf.prototype, {
    close: {
        enumerable: true,
        value:      close
    },

    _setWatcher: {
        value: setWatcher
    },

    _processFileChange: {
        value: processFileChange
    }
})

/**
 * Create an `fs.FSWatcher` for `this.path` and save under `this.watcher`. Follow file renames if possible.
 */
function setWatcher() {
    var self = this,
        path = this.path

    this.watcher = fs.watch(path, this.options, function (event, filename) {
        if (event === 'change')
        // stat the file to get its size
            fs.stat(path, function (err, stats) {
                if (err)
                    return self.emit('error', err)

                if (stats.size > self._size)
                    self._processFileChange(stats.size)
            })
        // follow renames
        else if (event === 'rename' && filename)
            path = self.path = resolve(dirname(path), filename)
    })
}

/**
 * Read the required `n` lines of the watched file and emit corresponding 'line' events.
 *
 * @param {number} newSize - The current file size. (Take size as an argument to avoid unnecessary `fs.stat()` calls.)
 */
function processFileChange(newSize) {
    var self = this

    readLastLines(self.path, self._size, newSize, self.count, function (err, lines) {
        if (err)
            return self.emit('error', err)

        self._size = newSize

        lines.forEach(function (line) {
            self.emit('line', line)
        })
    })
}

/**
 * Destroy the underlying `fs.FSWatcher` instance.
 */
function close() {
    this.watcher.close()
}

/**
 * Read the last `n` lines of the given file.
 *
 * @param {string} path - File path to read.
 * @param {number} from - Starting byte offset.
 * @param {number} pos - Size of the file.
 * @param {number} n - Count of lines to read.
 * @param {function(null|Error,null|[string])} cb
 */
function readLastLines(path, from, pos, n, cb) {
    // get a file descriptor for the given file
    fs.open(path, 'r', function (err, fd) {
        if (err)
            return cb(err, null)

        // todo: use bufferSize
        var buf = new Buffer(1),
            ctr = 0,
            cur = '',
            res = []

        function readChar() {
            fs.read(fd, buf, 0, 1, --pos, function (err) {
                if (err)
                    return cb(err, null)

                // 10 represents '\n' in utf8
                // todo: '\r'
                if (buf[ 0 ] === 10) {
                    // do not add the default `cur = ''` as a line
                    if (ctr)
                        ctr = res.unshift(cur)
                    else
                        ctr++

                    cur = ''
                }
                else
                    cur = buf + cur

                if (pos >= from && ctr < n)
                    readChar()
                else // close the file
                    fs.close(fd, function () {
                        cb(null, res)
                    })
            })
        }

        readChar()
    })
}

Object.defineProperties(exports, {
    // exclude inherited properties if any
    __proto__: null,

    /**
     * @prop {string} version - The version string from package manifest.
     */
    version: {
        enumerable: true,

        get: function () {
            return require('./package.json').version
        }
    },

    /**
     * @prop {string} fs - The file system interface to use.
     */
    fs: {
        enumerable: true,

        get: function () {
            return fs
        },
        set: function (value) {
            assert(value, 'fs interface must be an object')
            equal(typeof value.open, 'function', 'fs interface must have an open method')
            equal(typeof value.stat, 'function', 'fs interface must have a stat method')
            equal(typeof value.stat, 'function', 'fs interface must have a stat method')
            equal(typeof value.watch, 'function', 'fs interface must have a watch method')
            equal(typeof value.close, 'function', 'fs interface must have a close method')

            fs = value
        }
    }
})
