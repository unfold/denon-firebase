import firebase from 'firebase'
import DenonClient from './denon'

firebase.initializeApp({
  databaseURL: process.env.FIREBASE_URL,
})

const database = firebase.database()
const statusRef = database.ref('status')
const client = new DenonClient()

const options = {
  host: process.env.DENON_HOST,
  port: process.env.DENON_PORT,
  reconnectDelay: 2500,
}

const writeableProperties = {
  setMasterPower: value => client.setMasterPower(value),
  setMasterVolume: value => client.setMasterVolume(value),
  setPlaying: value => (value ? client.play() : client.pause()),
  skipNext: () => client.skipNext(),
  skipPrevious: () => client.skipPrevious(),
}

const onChildAdded = snapshot => {
  const writer = writeableProperties[snapshot.key]

  if (writer) {
    writer(snapshot.val())

    snapshot.ref.remove()
  }
}

const onConnected = () => {
  console.log('Connected!')

  statusRef.on('child_added', onChildAdded)
}

const connect = () => {
  console.log(`Connecting to ${options.host}:${options.port}`)

  client.once('connect', onConnected)
  client.connect(options)
}

const reconnect = delay => setTimeout(connect, delay)

client.on('close', () => {
  statusRef.off('child_added', onChildAdded)
  client.removeListener('connect', onConnected)

  console.log(`Connection closed, reconnecting in ${options.reconnectDelay / 1000}s...`)

  reconnect(options.reconnectDelay)
})

client.on('parsed', (property, value) => statusRef.child(property).set(value))
client.on('error', error => console.error('Connection error:', error.message))

/*
// Use this to detect other pieces of data you might need
client.on('unknown-data', data => {
  console.error('Could not parse:', data)
})
*/

connect()
