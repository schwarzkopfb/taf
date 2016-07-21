'use strict'

var Taf = require('./'),
    taf = new Taf('./test.log', 20)

taf.on('line', function (line) {
    console.log(line)
})

taf.on('error', function (err) {
    console.error(err.stack)
})
