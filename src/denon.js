// http://www.awe-europe.com/documents/Control%20Docs/Denon/Archive/AVR3311CI_AVR3311_991_PROTOCOL_V7.1.0.pdf

import net from 'net'
import split from 'split2'
import { EventEmitter } from 'events'

const EOL = '\r'
const ON = 'ON'
const OFF = 'OFF'

const QUERY = '?'

const MASTER_POWER = 'PW'
const MASTER_VOLUME = 'MV'

const SLAVE_POWER = 'Z2'
const SLAVE_VOLUME = 'CV'

const MAX_VOLUME = 'MAX'
const FRONT_LEFT = 'FL'

const INFORMATION_LIST = 'NSE'
const ARTIST = 'NSE2'
const ALBUM = 'NSE4'
const TRACK = 'NSE1'

const PLAY = 'NS9A'
const PAUSE = 'NS9B'
const NEXT = 'NS9D'
const PREVIOUS = 'NS9E'


const parseString = (data, prefix) => (
  data.startsWith(prefix) ? data.substr(prefix.length).trim() : undefined
)

const parseNumber = (data, prefix) => {
  const value = Number(parseString(data, prefix))

  return !isNaN(value) ? value : undefined
}

const parseBoolean = (data, prefix) => {
  const value = parseString(data, prefix)

  if (value === ON) {
    return true
  } else if (value === OFF) {
    return false
  }

  return undefined
}

const parseVolume = (data, prefix, maxVolume) => {
  const value = parseString(data, prefix)

  if (value) {
    const int = Number(value.substr(0, 2))
    const float = Number(value.substr(2)) / 10
    const volume = int + float
    const normalized = volume / maxVolume

    return normalized
  }

  return undefined
}

const parseSlaveVolume = (data, client) => (
  parseVolume(data, SLAVE_VOLUME + FRONT_LEFT, client.masterMaxVolume)
)

const parseInfo = (data, prefix) => {
  const value = parseString(data, prefix)

  return value ? value.substr(1) || null : undefined
}

const parsers = {
  masterMaxVolume: data => parseNumber(data, MASTER_VOLUME + MAX_VOLUME),
  masterPower: data => parseBoolean(data, MASTER_POWER),
  masterVolume: (data, client) => parseVolume(data, MASTER_VOLUME, client.masterMaxVolume),
  slavePower: data => parseBoolean(data, SLAVE_POWER),
  slaveVolume: parseSlaveVolume,
  artist: data => parseInfo(data, ARTIST),
  album: data => parseInfo(data, ALBUM),
  track: data => parseInfo(data, TRACK),
}

export default class DenonClient extends EventEmitter {
  masterMaxVolume = 60

  connect(options) {
    this.connected = false

    const socket = net.createConnection(options)
    socket.setTimeout(options.timeout || 500, () => {
      if (socket.connecting === true) {
        socket.destroy()

        this.emit('error', new Error('Cannot connect'))
      } else {
        this.emit('timeout')
      }
    })

    socket.addListener('error', error => this.emit('error', error))
    socket.addListener('close', () => this.emit('close'))
    socket.addListener('connect', () => {
      this.emit('connect')
      this.query(MASTER_POWER)
      this.query(MASTER_VOLUME)
      this.query(SLAVE_POWER)
      this.query(SLAVE_VOLUME)
      this.send(INFORMATION_LIST)

      setInterval(() => this.send(INFORMATION_LIST), 2500)
    })

    this.socket = socket
    this.stream = socket.pipe(split(EOL))
    this.stream.on('data', data => this.parseData(data))
  }

  parseData(data) {
    const parsed = Object.keys(parsers).some(property => {
      const parser = parsers[property]
      const value = parser(data, this)

      if (value !== undefined) {
        // We need the masterMaxVolume to normalize masterVolume
        if (property === 'masterMaxVolume') {
          this.masterMaxVolume = value
        }

        this.emit('parsed', property, value)

        return true
      }

      return false
    })

    if (!parsed) {
      this.emit('unknown-data', data)
    }
  }

  send(command) {
    this.socket.write(command + EOL)
  }

  query(command) {
    this.send(command + QUERY)
  }

  setMasterPower(active) {
    const value = active ? ON : OFF

    this.send(MASTER_VOLUME + value)
  }

  setMasterVolume(volume) {
    const denormalized = Math.floor(volume * this.masterMaxVolume)

    this.send(MASTER_VOLUME + denormalized)
  }

  play() {
    this.send(PLAY)
  }

  pause() {
    this.send(PAUSE)
  }

  skipNext() {
    this.send(NEXT)
  }

  skipPrevious() {
    this.send(PREVIOUS)
  }
}
