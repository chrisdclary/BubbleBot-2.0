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

// NowPlaying message - to be deleted once song ends
const nowPlaying = new Map()

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
            const playlist = await ytpl(args[0])
            //playlist.items.forEach(video => /* Enqueue each URL */)
            //debugLog(playlist.items[0].shortUrl)
            addToQueue(msg, playlist.items, true)

          } 
          if (ytdl.validateURL(args[0])) { 
            // If they entered a valid youtube url, play that directly from ytdl
            addToQueue(msg, args[0], true)

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

        addToQueue(msg, searchResults[num - 1], playnext)

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


//Enqueue Function
async function addToQueue (msg, url, playnext) {
  q = getQueue(msg.guildID)

  // url is an object if we are adding a playlist
  if (Array.isArray(url)) {
    url.forEach(element => {q.enqueue(element.shortUrl); console.log(element.title)})
  }

  else {
    if (playnext) {
      q.push(url)
    } else {
      q.enqueue(url)
    }
  }

  debugLog('Added a song to the queue')

  //Check connection
  let connection = bot.voiceConnections.find(conn => conn.id === msg.guildID)
  if (connection == null) { // join vc
    debugLog('No connection found, joining VC')
    join(msg.channel.id, msg.member, url, msg.guildID)
  } else { // play song
    if (msg.member.voiceState.channelID == connection.channelID) {
      debugLog('Connection found, playing song...')
      play(msg.member, connection, msg.channel.id, url, msg.guildID)
    } else {
      bot.createMessage(msg.channel.id, {
        embed: {
          description: 'Bot is already playing in another VC'
        }
      })
      q.pop()
    }
  }
}


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
async function join (textChannelID, member, url, guildID) {
  const voiceChannel = member.voiceState.channelID

  // Make sure stream volume is set to 1 (will be divided later)
  streamVolume = 10

  if (voiceChannel != null) {

    const connection = bot.joinVoiceChannel(voiceChannel)
    debugLog('Joined VC')

    connection
      .then((connection) => {

        play(member, connection, textChannelID, url, guildID)

        // Create event listener for connection errors
        connection.on('error', async (err) => {
          throwError('Connection', err)
        })
      })
      .catch((err) => {
        throwError('Join', err)
        join(textChannelID, member, url, guildID)
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
    
    debugLog('Connection free')

    debugLog('Starting PlayStream...')
    // Download the next song in the queue and play it
    var nextPlay = q.peek();
    playStream(connection, nextPlay, guildID)

    debugLog('Getting video info...')
    // Get title for next song in the queue
    try {
      let info = ytdl.getBasicInfo(nextPlay, {
        requestOptions: {
          headers: {
            cookie: COOKIE
          }
        }
      })
      info
        .then(async (info) => {
          var np = await bot.createMessage(textChannelID, {
            embed: {
              description: `Now Playing:  [${info.videoDetails.title}](${nextPlay})`
            }
          })
          nowPlaying.set(guildID, np.id) 
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
      if (nowPlaying.has(guildID) != null) {
        bot.deleteMessage(textChannelID, nowPlaying.get(guildID)).catch((err) => {
          throwError('Delete', err)
        })
        nowPlaying.delete(guildID)
      }
      // Leave VC if this was the last song in the queue
      if (q.isEmpty()) {
        bot.leaveVoiceChannel(connection.channelID)
        debugLog('Disconnected from VC due to Fetch error')
      }
      return
    }

    q.dequeue()
    debugLog('Removed song from queue')

    // When a song ends, play the next song in the queue if there is one,
    // Otherwise, leave the voice channel
    connection.once('end', () => {
      debugLog('Reached end of song')

      // Reset stream volume to 1;
      streamVolume = 10
      connection.setVolume(streamVolume / 10)

      // Delete the previous "Now Playing" message
      if (nowPlaying.has(guildID) != null) {
        bot.deleteMessage(textChannelID, nowPlaying.get(guildID)).catch((err) => {
          throwError('Delete', err)
        })
        nowPlaying.delete(guildID)
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
        }, 300000)
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
function playStream (connection, url) {

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
