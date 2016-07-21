'use strict'

exports = module.exports = Taf

var fs       = require('fs'),
    path     = require('path'),
    assert   = require('assert'),
    resolve  = path.resolve,
    dirname  = path.dirname,
    inherits = require('util').inherits,
    EE       = require('events').EventEmitter

/**
 * Construct a `Taf` instance to monitor file changes line-by-line.
 *
 * @param {string} path - The file path to watch.
 * @param {number} [n=10] - Count of lines to read from the file before subscribing for changes. Same as '-n' param for `tail(1)`.
 * @param {object} [options] - Settings for this `Taf` instance plus options to pass to `fs.watch()`.
 * @param {number} [options.count=10] - Set `n` argument but via an options object.
 * @param {number|string} [options.bufferSize=1024] - Size of the read buffer to use. `bytes` module is used to parse the value.
 * @returns {Taf}
 */
function Taf(path, n, options) {
    if (!(this instanceof Taf))
        return new Taf(path, n)

    assert(path, 'path is required')
    assert.equal(typeof path, 'string', 'path must be a string')

    if (n === undefined)
        n = 10
    else if (typeof n === 'object') {
        options = n
        n       = Number(options.n) || Number(options.count) || 10
    }
    else
        assert.equal(typeof n, 'number', 'n must be a number')

    // todo: utf8 encoding should be enforced

    if (!options)
        options = {}

    EE.call(this)

    this.path    = path
    this.count   = n
    this.options = options
    // todo: bufferSize

    Object.defineProperties(this, {
        _size: {
            writable: true,
            value:    0
        }
    })

    var self = this

    process.nextTick(function () {
        // stat the file to get its size
        fs.stat(path, function (err, stats) {
            if (err)
                return self.emit('error', err)

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
        else if (event === 'rename' && filename)
            path = self.path = resolve(dirname(path), filename)
    })
}

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

function close() {
    this.watcher.close()
}

function readLastLines(path, from, size, n, cb) {
    // then stat the file to get the size
    fs.open(path, 'r', function (err, fd) {
        if (err)
            return cb(err)

        var buf = new Buffer(1),
            ctr = 0,
            cur = '',
            res = [],
            pos = size

        function readChar() {
            fs.read(fd, buf, 0, 1, --pos, function (err) {
                if (err)
                    return cb(err)

                // 10 represents '\n' in utf8
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
