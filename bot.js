const COMMAND_PREFIX = '.'

const auth = require('./auth.json')
const Eris = require('eris')
const ytdl = require('ytdl-core')
const ytsr = require('ytsr')
const ytpl = require('ytpl')
const { Collection, Message } = require('eris')

const bot = new Eris(auth.token)

const COOKIE = auth.cookie

bot.on('ready', () => {
  debugLog('Ready!')
})

// Default debug mode: true (for now)
debug = true

// Map for holding search requests
const searchMap = new Map()

// Holds queues for different guilds
const guildQueues = new Map()

// Volume of current stream. Resets to 1 after every song
let streamVolume = 10

// NowPlaying message - displays song info and volume control
let nowPlaying

bot.on('messageCreate', async msg => {
  const textChannelID = msg.channel.id

  if (msg.author.bot) { return }

  // Only react to messages beginning with '.'
  if (msg.content.substring(0, 1) == COMMAND_PREFIX) {
    let args = msg.content.substring(1).split(' ')
    const cmd = args[0]
    args = args.splice(1)

    switch (cmd) {
      case 'hello': {
        await bot.createMessage(textChannelID, 'Hello World!')
        break
      }

      case 'clear': {// clear the queue
        let q = getQueue(msg.guildID)
        q.clear()
        bot.createMessage(textChannelID, {
          embed: {
            description: 'Queue cleared!'
          }
        })
        break
      }

        // debug mode just prints more info to the console
      case 'debug': {
        debug = !debug
        if (debug) {
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Turning debug mode on.'
            }
          })
        } else {
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Turning debug mode off.'
            }
          })
        }
        break
      }

      case 'debuginfo': {
        let q = getQueue(msg.guildID)
        console.log(q)
        let connection = bot.voiceConnections.find(conn => conn.id === msg.guildID)
        console.log(connection)
        break
      }

      case 'help': {
        bot.createMessage(textChannelID, {
          embed: {
            title: 'Commands',
            description: `.p/play [url / search query]  -  Play audio from given youtube URL or search keywords\n
                        .q/queue  -  Shows songs in the queue\n
                        .skip  -  Skips the current song\n
                        .r/remove [number]  -  Removes a song from the queue\n
                        .clear  -  Clears all songs from the queue`
          }
        })
        break
      }
      case 'q': {// show queue

        showQueue(textChannelID, msg.guildID)
        break
      }
      case 'r': { // remove specific song from queue
        let q = getQueue(msg.guildID)
        if (q.isEmpty()) {
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Queue is empty.'
            }
          })
          break
        }
        let num = parseInt(args[0], 10)
        if (isNaN(num) || num < 1 || q.size() < num) {
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Can\'t remove that from the queue.'
            }
          })
        } else {
          remove(textChannelID, num, msg.guildID)
        }
        break
      }
      case 'skip': { // skip current song
        // Find an open voice connection with the same guild ID as the voice channel this command was invoked
        let connection = bot.voiceConnections.find(conn => conn.id === msg.guildID)

        // user's voice connection
        let voiceChannel = msg.member.voiceState.channelID

        if (!connection) {
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Not playing music rn.'
            }
          })
        } else {
          const botVC = parseInt(connection.channelID, 10)
          const memberVC = parseInt(voiceChannel, 10)
          if (botVC == memberVC) {
            connection.stopPlaying()
          } else {
            bot.createMessage(textChannelID, {
              embed: {
                description: 'Must be connected to VC to skip.'
              }
            })
          }
        }

        break
      }
      case 'p': {
        if (args.length > 0) {
          if (ytpl.validateID(args[0])) {
            debugLog('Parsed input as a playlist')
          }
          if (ytdl.validateURL(args[0])) { // If they entered a valid youtube url, play that directly from ytdl
            // See if there is an existing connection in this server
            let connection = bot.voiceConnections.find(conn => conn.id === msg.guildID)

            // No connection found
            if (connection == null) {
              debugLog('No connection found, joining VC')
              join(textChannelID, msg.member, args[0], false, msg.guildID)
            } else { // Connection found
              // Only add song to the queue if user is in the right voice channel
              if (msg.member.voiceState.channelID == connection.channelID) {
                let q = getQueue(msg.guildID)
                q.enqueue(args[0])
                debugLog('Added a song to the queue')
                play(msg.member, connection, textChannelID, args[0], msg.guildID)
              } else { // Otherwise send a message and do nothing
                bot.createMessage(textChannelID, {
                  embed: {
                    description: 'Bot is already playing in another VC'
                  }
                })
              }
            }
          } else {
            // If they entered something other than a URL, search youtube
            search(textChannelID, msg, args.join(' '), false)
          }
        } else { // If they didnt
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Proper usage: .play < search terms / youtube URL >'
            }
          })
        }

        break
      }
      // playnext is the same as play, but adds a song to the beginning of the queue rather than the end
      case 'pn': {
        if (args.length > 0) {
          if (ytdl.validateURL(args[0])) {
            // If they entered a valid youtube url, play that directly from ytdl
            let connection = bot.voiceConnections.find(conn => conn.id === msg.guildID)
            if (connection == null) { // join vc
              debugLog('No connection found, joining VC')
              join(textChannelID, msg.member, args[0], true, msg.guildID)
            } else { // play song
              if (msg.member.voiceState.channelID == connection.channelID) {
                let q = getQueue(msg.guildID)
                q.push(args[0])
                debugLog('Added a song to the queue')
                play(msg.member, connection, textChannelID, args[0], msg.guildID)
              } else {
                bot.createMessage(textChannelID, {
                  embed: {
                    description: 'Bot is already playing in another VC'
                  }
                })
              }
            }
          } else {
            // If they entered something else, search youtube
            search(textChannelID, msg, args.join(' '), true)
          }
        } else {
          bot.createMessage(textChannelID, {
            embed: {
              description: 'Proper usage: .play < search terms / youtube URL >'
            }
          })
        }

        break
      }
      default:

                // Do Nothing
    }
  }

  // If the message doesn't begin with '.' , a user may be reacting to a search result
  else if (searchMap.has(msg.author.id)) {
    const tuple = searchMap.get(msg.author.id)
    const requestChannelID = tuple[2] // Channel where request was given
    const searchResults = tuple[1] // Search results
    const playnext = tuple[0] // Boolean determines whether song goes to beginning or end of queue

    // Only deal with messages in the same channel as search request
    if (textChannelID == requestChannelID) {
      // User input
      let num = parseInt(msg.content, 10)

      // Number of search results
      const max = searchResults.length

      // Make sure they are making a valid selection
      if (isNaN(num) || num < 1 || num > max) {
        bot.createMessage(textChannelID, {
          embed: {
            description: 'Invalid selection.'
          }
        })
      } else {
        // Play the selected video as if they used the .play command
        let connection = bot.voiceConnections.find(conn => conn.id === msg.guildID)
        if (connection == null) { // join vc
          join(textChannelID, msg.member, searchResults[num - 1], playnext, msg.guildID)
        } else { // play song
          if (msg.member.voiceState.channelID == connection.channelID) {
            if (playnext) {
              let q = getQueue(msg.guildID)
              q.push(searchResults[num - 1])
            } else {
              let q = getQueue(msg.guildID)
              q.enqueue(searchResults[num - 1])
            }
            debugLog('Added song to queue')
            play(msg.member, connection, textChannelID, searchResults[num - 1], msg.guildID)
          } else {
            bot.createMessage(textChannelID, {
              embed: {
                description: 'Bot is already playing in another VC'
              }
            })
          }
        }
        searchMap.delete(msg.author.id)
      }
    }
  }
})

// Generic error handler for client errors
bot.on('error', (err) => {
  throwError('Bot', err)
  bot.connect()
})

// Search youtube for results and display the top 5
async function search (textChannelID, msg, query, playnext) {
  const searchResults = []
  const results = await ytsr(query, { limit: 20 })
  // Filter those results to only videos (no livestreams or playlists)
  const videos = results.items.filter(x => x.type === 'video')

  // Display up to 5 videos from the results.
  let message = ''

  // Assigns max to the lower value of 5 and videos.length
  const max = videos.length > 5 ? 5 : videos.length

  for (i = 0; i < max; i++) {
    message += `${i + 1} - [${videos[i].title}](${videos[i].url}) [ ${videos[i].duration} ]\n`
    searchResults.push(videos[i].url)
  }
  bot.createMessage(textChannelID, {
    embed: {
      title: 'Search results',
      description: message
    }
  })

  const tuple = [playnext, searchResults, msg.channel.id]
  searchMap.set(msg.author.id, tuple)
  // respond = msg;

  // Timeout search request after 15 seconds
  setTimeout(() => { searchMap.delete(msg.author.id) }, 60000)
}

// Remove the requested song from the queue
async function remove (textChannelID, n, guildID) {
  const q = getQueue(guildID)
  const removed = q.remove(n)
  const info = await ytdl.getBasicInfo(removed)

  bot.createMessage(textChannelID, {
    embed: {
      description: `Removed [${info.videoDetails.title}](${removed}) from the queue.`
    }
  })
}

// Display the queued songs in order
async function showQueue (textChannelID, guildID) {
  const q = getQueue(guildID)
  let message = ''
  if (q.isEmpty()) {
    bot.createMessage(textChannelID, {
      embed: {
        description: 'Queue is empty.'
      }
    })
  } else {
    for (i = 0; i < q.size(); i++) {
      const info = await ytdl.getBasicInfo(q.get(i))
      message += `${i + 1}: [${info.videoDetails.title}](${q.get(i)})\n`
    }
    bot.createMessage(textChannelID, {
      embed: {
        title: 'Queue',
        description: message
      }
    })
  }
}

// Join the voice chat and queue the song, then play the queued song
async function join (textChannelID, member, url, playnext, guildID) {
  const voiceChannel = member.voiceState.channelID

  // Make sure stream volume is set to 1 (will be divided later)
  streamVolume = 10

  if (voiceChannel != null) {
    const q = getQueue(guildID)

    const connection = bot.joinVoiceChannel(voiceChannel)
    debugLog('Joined VC')

    connection
      .then((connection) => {
        // Push to front or back of queue depending if this was invoked by playnext
        if (playnext) {
          q.push(url)
        } else {
          q.enqueue(url)
        }
        debugLog('Added song to the queue')

        play(member, connection, textChannelID, url, guildID)

        // Create event listener for connection errors
        connection.on('error', async (err) => {
          throwError('Connection', err)
          // bot.leaveVoiceChannel(connection.channelID);
          // debugLog("Disconnected from VC due to Connection error");
        })
      })
      .catch((err) => {
        throwError('Join', err)
        join(textChannelID, member, url, playnext, guildID)
      })
  } else {
    bot.createMessage(textChannelID, {
      embed: {
        description: 'Join a voice channel to play music.'
      }
    })
  }
}

async function play (member, connection, textChannelID, url, guildID) {
  const q = getQueue(guildID)

  // Play the next song in the queue if nothing is currently playing,
  // Otherwise respond that the song has been added to the queue
  if (!connection.playing) {
    debugLog('Connection free, getting video info...')

    // Get title for next song in the queue
    try {
      let info = ytdl.getBasicInfo(q.peek(), {
        requestOptions: {
          headers: {
            cookie: COOKIE
          }
        }
      })
      info
        .then(async (info) => {
          nowPlaying = await bot.createMessage(textChannelID, {
            embed: {
              description: `Now Playing:  [${info.videoDetails.title}](${q.peek()})`
            }
          })
        })

      // Throw error if we can't get video info
    } catch (err) {
      // Send an error message to text channel
      throwError('Youtube Fetch', err)
      bot.createMessage(textChannelID, {
        embed: {
          description: 'Problem fetching video info.'
        }
      })
      // remove offending song from queue
      q.dequeue()
      // Delete "nowPlaying" message if it exists
      if (nowPlaying != null) {
        bot.deleteMessage(textChannelID, nowPlaying.id).catch((err) => {
          throwError('Delete', err)
        })
        nowPlaying = null
      }
      // Leave VC if this was the last song in the queue
      if (q.isEmpty()) {
        bot.leaveVoiceChannel(connection.channelID)
        debugLog('Disconnected from VC due to Fetch error')
      }
      return
    }

    debugLog('Starting PlayStream...')
    // Download the next song in the queue and play it
    playStream(connection, q.peek(), guildID)

    // When a song ends, play the next song in the queue if there is one,
    // Otherwise, leave the voice channel
    connection.once('end', () => {
      debugLog('Reached end of song')

      // Reset stream volume to 1;
      streamVolume = 10
      connection.setVolume(streamVolume / 10)

      // Delete the previous "Now Playing" message
      if (nowPlaying != null) {
        bot.deleteMessage(textChannelID, nowPlaying.id).catch((err) => {
          throwError('Delete', err)
        })
        nowPlaying = null
      }

      // Play next song if queue isn't empty
      if (!q.isEmpty()) {
        debugLog('Playing next song in queue')
        play(member, connection, textChannelID, q.peek(), guildID)
      } else { // Otherwise disconnect after idling for 30 seconds
        setTimeout(() => {
          if (!connection.playing && q.isEmpty()) {
            debugLog('Disconnecting from VC...')
            bot.leaveVoiceChannel(connection.channelID)
          }
        }, 60000)
      }
    })

    // Bot is playing something, so display the song that was queued
  } else {
    try {
      let info = await ytdl.getBasicInfo(url, {
        requestOptions: {
          headers: {
            cookie: COOKIE
          }
        }
      })
      bot.createMessage(textChannelID, {
        embed: {
          description: `Queued:  [${info.videoDetails.title}](${q.end()})`
        }
      })
    } catch (err) {
      throwError('Youtube Fetch', err)
      bot.createMessage(textChannelID, {
        embed: {
          description: 'Problem fetching info.'
        }
      })
      q.pop()
    }
  }
}

// Helper function for playing music
function playStream (connection, url, guildID, retries = 0) {
  const q = getQueue(guildID)

  debugLog('Downloading stream...')
  let stream = ytdl(url, {
    filter: 'audioonly',
    highWaterMark: 1 << 25,
    dlChunkSize: 1 << 30,
    requestOptions: {
      headers: {
        cookie: COOKIE // Cookie allows playback of age restricted content
      }
    }
  }).on('response', () => {
    if (!connection) {
      debugLog('Connection not found')
    }

    if (connection.ready) {
      try {
        debugLog('Playing song')
        connection.play(stream, {
          inlineVolume: true
        })
        q.dequeue()
        debugLog('Removed song from queue')
      } catch (err) {
        throwError('Playback', err)
      }
    } else {
      debugLog('Connection not ready')
    }
  })

  stream.once('error', (err) => {
    throwError('Stream', err)
  })
}

// Prints the error with the time & date
function throwError (type, error) {
  const time = new Date()
  console.error(`\n${type} Error\n${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`)
  console.error(error)
  console.error('\n')
}

function debugLog (message) {
  if (debug) {
    let buffer = ''
    for (i = 60; i > message.length; i--) {
      buffer = buffer + ' '
    }
    const time = new Date()
    console.log(`${message}${buffer}${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`)
  }
}

function getQueue (guild) {
  if (!guildQueues.has(guild)) {
    const q = new Queue()
    guildQueues.set(guild, q)
  }
  return guildQueues.get(guild)
}

function Queue () {
  this.elements = []
}

Queue.prototype.enqueue = function (e) {
  this.elements.push(e)
}

Queue.prototype.dequeue = function () {
  return this.elements.shift()
}

Queue.prototype.push = function (e) {
  this.elements.unshift(e)
}

Queue.prototype.pop = function () {
  return this.elements.pop()
}

Queue.prototype.isEmpty = function () {
  return this.elements.length == 0
}

Queue.prototype.peek = function () {
  return !this.isEmpty() ? this.elements[0] : undefined
}

Queue.prototype.end = function () {
  return !this.isEmpty() ? this.elements[this.elements.length - 1] : undefined
}

Queue.prototype.remove = function (n) {
  return this.elements.splice(n - 1, 1)
}

Queue.prototype.clear = function () {
  this.elements = []
}

Queue.prototype.get = function (n) {
  return this.elements[n]
}

Queue.prototype.size = function () {
  return this.elements.length
}

bot.connect()
