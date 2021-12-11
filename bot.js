const COMMAND_PREFIX = '.';

const auth = require('./auth.json');
const Eris = require('eris');
const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const { Collection, Message } = require('eris');

const bot = new Eris(auth.token);

const COOKIE = auth.cookie;

bot.on("ready", () => {
    debugLog("Ready!")
});

// Default debug mode: true (for now)
debug = true;

// Map for holding search requests
const searchMap = new Map();

// Holds queues for different guilds
const guildQueues = new Map();

bot.on("messageCreate", async msg => {

    var textChannelID = msg.channel.id;

    if ( msg.author.bot )
        return;

    // Only react to messages beginning with '.'
    if ( msg.content.substring(0,1) == COMMAND_PREFIX ) {

        var args = msg.content.substring(1).split(' ');
        var cmd = args[0];
        args = args.splice(1);


        switch ( cmd ) {

            case 'hello':
                await bot.createMessage(textChannelID, `Hello World!`);
                break;
            
            case 'clear': // clear the queue
                var q = getQueue( msg.guildID );
                q.clear();
                bot.createMessage(textChannelID, {
                    embed: {
                        description: `Queue cleared!`
                    }
                });
                break;
            
            // debug mode just prints more info to the console
            case 'debug':
                debug = !debug;
                if ( debug ){
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Turning debug mode on.`
                        }
                    });
                } else {
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Turning debug mode off.`
                        }
                    });
                }
                break;
            
            case 'help':
                bot.createMessage(textChannelID, {
                    embed: {
                        title: `Commands`,
                        description: `.p/play [url / search query]  -  Play audio from given youtube URL or search keywords\n
                        .q/queue  -  Shows songs in the queue\n
                        .skip  -  Skips the current song\n
                        .r/remove [number]  -  Removes a song from the queue\n
                        .clear  -  Clears all songs from the queue`
                    }
                });
                break;

            case 'q':
            case 'queue': // show queue
                var q = getQueue( msg.guildID );
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                } else {
                    showQueue(textChannelID, msg.guildID);
                }
                
                break;
            
            case 'r':
            case 'remove': // remove specific song from queue
                var q = getQueue( msg.guildID );
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                    break;
                }
                var num = parseInt(args[0], 10);
                if ( isNaN(num) || num < 1 || q.size() < num ) {
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Can't remove that from the queue.`
                        }
                    });
                } else {
                    remove(textChannelID, num, msg.guildID);
                }
                break;
            
            case 'skip': // skip current song
                // Find an open voice connection with the same guild ID as the voice channel this command was invoked
                const connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);

                // user's voice connection
                var voiceChannel = msg.member.voiceState.channelID;
                
                if ( !connection ) {
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Not playing music rn.`
                        }
                    });
                } else {
                    var botVC = parseInt(connection.channelID, 10);
                    var memberVC = parseInt(voiceChannel, 10);
                    if ( botVC == memberVC ) {
                        connection.stopPlaying();

                    } else {
                        bot.createMessage(textChannelID, {
                            embed: {
                                description: `Must be connected to VC to skip.`
                            }
                        });
                    }
                }
                
                break;
            
            case 'p':
            case 'play':
                if ( args.length > 0 ){
                    if ( ytdl.validateURL(args[0])){ // If they entered a valid youtube url, play that directly from ytdl
                        // See if there is an existing connection in this server
                        const connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);

                        // No connection found
                        if ( connection == null ) { 
                            debugLog("No connection found, joining VC");
                            join( textChannelID, msg.member, args[0], false, msg.guildID );
                        } else { // Connection found
                            // Only add song to the queue if user is in the right voice channel
                            if ( msg.member.voiceState.channelID == connection.channelID ) {
                                var q = getQueue( msg.guildID );
                                q.enqueue(args[0]);
                                debugLog("Added a song to the queue");
                                play( msg.member, connection, textChannelID, args[0], msg.guildID );
                            } else { // Otherwise send a message and do nothing
                                bot.createMessage(textChannelID, {
                                    embed: {
                                        description: `Bot is already playing in another VC`
                                    }
                                });
                            }
                            
                        }
                    } else {
                        // If they entered something other than a URL, search youtube
                        search(textChannelID, msg, args.join(' '), false);
                    }
                    
                } else { // If they didnt 
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Proper usage: .play < search terms / youtube URL >`
                        }
                    });
                }
                
                break;

            // playnext is the same as play, but adds a song to the beginning of the queue rather than the end
            case 'pn':
            case 'playnext':
                if ( args.length > 0 ){
                    if ( ytdl.validateURL(args[0])){
                        // If they entered a valid youtube url, play that directly from ytdl
                        const connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                        if ( connection == null ) { // join vc
                            debugLog("No connection found, joining VC");
                            join( textChannelID, msg.member, args[0], true, msg.guildID );
                        } else { // play song
                            if ( msg.member.voiceState.channelID == connection.channelID ) {
                                var q = getQueue( msg.guildID );
                                q.push(args[0]);
                                debugLog("Added a song to the queue");
                                play( msg.member, connection, textChannelID, args[0], msg.guildID );
                            } else {
                                bot.createMessage(textChannelID, {
                                    embed: {
                                        description: `Bot is already playing in another VC`
                                    }
                                });
                            }
                        }
                    } else {
                        // If they entered something else, search youtube
                        search(textChannelID, msg, args.join(' '), true);
                    }
                    
                } else {
                    bot.createMessage(textChannelID, {
                        embed: {
                            description: `Proper usage: .play < search terms / youtube URL >`
                        }
                    });
                }
                
                break;
            default:

                // Do Nothing

        }
    } 

    // If the message doesn't begin with '.' , a user may be reacting to a search result
    else if ( searchMap.has( msg.author.id ) ) {

        var tuple = searchMap.get( msg.author.id );
        var requestChannelID = tuple[2];        // Channel where request was given
        var searchResults = tuple[1];           // Search results
        var playnext = tuple[0];                // Boolean determines whether song goes to beginning or end of queue

        // Only deal with messages in the same channel as search request
        if ( textChannelID == requestChannelID ){

            // User input
            var num = parseInt(msg.content, 10);

            // Number of search results
            var max = searchResults.length;

            // Make sure they are making a valid selection
            if ( isNaN(num) || num < 1 || num > max ) {
                bot.createMessage(textChannelID, {
                    embed: {
                        description: `Invalid selection.`
                    }
                });
            } else {
                // Play the selected video as if they used the .play command
                const connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                if ( connection == null ) { // join vc
                    join( textChannelID, msg.member, searchResults[num-1], playnext, msg.guildID );
                } else { // play song
                    if ( msg.member.voiceState.channelID == connection.channelID ) {
                        if ( playnext) {
                            var q = getQueue( msg.guildID );
                            q.push(searchResults[num-1]);
                        } else {
                            var q = getQueue( msg.guildID );
                            q.enqueue(searchResults[num-1]);
                        }
                        debugLog("Added song to queue");
                        play( msg.member, connection, textChannelID, searchResults[num-1], msg.guildID );
                    } else {
                        bot.createMessage(textChannelID, {
                            embed: {
                                description: `Bot is already playing in another VC`
                            }
                        });
                    }
                }
                searchMap.delete( msg.author.id );
            }
        }
    }
})

bot.on("error", (err) => {
    throwError("Bot", err);
})

// Search youtube for results and display the top 5
async function search( textChannelID, msg, query, playnext ) {
    var searchResults = [];
    const results = await ytsr(query, { limit: 20 });
    // Filter those results to only videos (no livestreams or playlists)
    const videos = results.items.filter(x => x.type === "video");
    
    // Display up to 5 videos from the results.
    var message = ``;

    // Assigns max to the lower value of 5 and videos.length
    var max = 5 < videos.length ? 5 : videos.length;
    
    for ( i = 0; i < max; i++ ) {
        message += `${i+1} - [${videos[i].title}](${videos[i].url}) [ ${videos[i].duration} ]\n`;
        searchResults.push(videos[i].url);
    }
    bot.createMessage(textChannelID, {
        embed: {
            title: "Search results",
            description: message
        }
    });

    var tuple = [playnext, searchResults, msg.channel.id]
    searchMap.set( msg.author.id, tuple );
    //respond = msg;

    // Timeout search request after 15 seconds
    setTimeout(() => {searchMap.delete(msg.author.id)}, 30000);

}

// Remove the requested song from the queue
async function remove( textChannelID, n, guildID ) {
    var q = getQueue( guildID );
    const removed = q.remove(n);
    var info = await ytdl.getBasicInfo(removed);

    bot.createMessage(textChannelID, {
        embed: {
            description: `Removed [${info.videoDetails.title}](${removed}) from the queue.`
        }
    });
}

// Display the queued songs in order
async function showQueue( textChannelID, guildID ) {
    var q = getQueue( guildID );
    var message = ``;

    for ( i = 0; i < q.size(); i++ ) {
        var info = await ytdl.getBasicInfo(q.get(i));
        message += `${i+1}: [${info.videoDetails.title}](${q.get(i)})\n`;
        
    }
    bot.createMessage(textChannelID, {
        embed: {
            title: "Queue",
            description: message
        }
    });
}

// Join the voice chat and queue the song, then play the queued song
async function join( textChannelID, member, url, playnext, guildID) {

    var voiceChannel = member.voiceState.channelID;

    if ( voiceChannel != null ) {
        var q = getQueue( guildID );
        
        const connection = bot.joinVoiceChannel(voiceChannel);
        debugLog("Joined VC");

        connection
        .then( (connection) => {
            // Push to front or back of queue depending if this was invoked by playnext
            if( playnext ) {
                q.push(url);
            } else {
                q.enqueue(url);
            }
            debugLog("Added song to the queue");

            play( member, connection, textChannelID, url, guildID );

            // Create event listener for connection errors
            connection.on("error", async (err) => {
                throwError("Connection", err);
                bot.leaveVoiceChannel(connection.channelID);
                debugLog("Disconnected from VC due to error");
            })
        })
        .catch( (err) => {
            throwError("Join", err);
            join( textChannelID, member, url, playnext, guildID );
        })


    } else {
        bot.createMessage(textChannelID, {
            embed: {
                description: `Join a voice channel to play music.`
            }
        });
    }
}

async function play( member, connection, textChannelID, url, guildID, retries=0 ) {

    var q = getQueue( guildID );

    // Play the next song in the queue if nothing is currently playing,
    // Otherwise respond that the song has been added to the queue
    if ( !connection.playing ) {
        var nowPlaying;
        debugLog("Connection free, starting to play...");
            
        // Get title for next song in the queue
        debugLog("Getting video info...");

        try {
            var info = ytdl.getBasicInfo(q.peek(), {
                requestOptions: {
                    headers: {
                        cookie: COOKIE,
                    },
                },
            });
            info
            .then( async (info) => {
                nowPlaying = await bot.createMessage(textChannelID, {
                    embed: {
                        description: `Now Playing:  [${info.videoDetails.title}](${q.peek()})`
                    }
                });
            })
            
        // Throw error if we can't get video info
        } catch(err) {
            // Send an error message to text channel
            throwError("Youtube Fetch", err);
            bot.createMessage(textChannelID, {
                embed: {
                    description: `Problem fetching video info.`
                }
            });
            // remove offending song from queue
            q.dequeue();
            // Delete "nowPlaying" message if it exists
            if ( nowPlaying != null ) {
                bot.deleteMessage( textChannelID, nowPlaying.id ).catch( (err) => {
                    throwError("Delete", err);
                });
            }
            // Leave VC if this was the last song in the queue
            if ( q.isEmpty ){
                bot.leaveVoiceChannel(connection.channelID);
                debugLog("Disconnected from VC due to error");
            }
            return;
        }


        // Download the next song in the queue and play it
        const stream = ytdl(q.peek(), { 
            filter: "audioonly", 
            highWaterMark: 1<<21, 
            dlChunkSize: 1<<30, 
            requestOptions: {
                headers: {
                    cookie: COOKIE, // Cookie allows playback of age restricted content
                },
            },
        }).on('response', () => {

            if ( !connection ){
                debugLog("Connection not found");
                return;
            }
            
            if ( connection.ready ) {
                try {
                    debugLog("Playing song...");
                    connection.play(stream);
                    // If song starts playing without error, remove it from the queue
                    q.dequeue();
                    debugLog("Removed song from queue")
                    
                } catch ( err ) {
                    throwError("Player", err);
                }
            } else {
                debugLog("Connection not ready");
                connection.stopPlaying();
            }
        });

        stream.on('error', (err) => {
            throwError("Stream", err);
            if ( nowPlaying != null ) {
                bot.deleteMessage( textChannelID, nowPlaying.id ).catch( (err) => {
                    throwError("Delete", err);
                });
            }
            // Try to play this song a few times before moving on
            if ( retries > 5 ) {
                q.dequeue();
            }
            bot.leaveVoiceChannel(connection.channelID);
            var song = q.peek();
            q.dequeue();
            join( textChannelID, member, song, true, guildID );

        })
        

        // When a song ends, play the next song in the queue if there is one,
        // Otherwise, leave the voice channel
        connection.once('end', () => {
            debugLog("Reached end of song");    

            // Delete the previous "Now Playing" message
            if ( nowPlaying != null ) {
                bot.deleteMessage( textChannelID, nowPlaying.id ).catch( (err) => {
                    throwError("Delete", err);
                });
            }

            // Play next song if queue isn't empty
            if ( !q.isEmpty() ){
                debugLog("Playing next song in queue");
                play( member, connection, textChannelID, q.peek(), guildID );
            } else {  // Otherwise disconnect after idling for 30 seconds
                setTimeout(() => {
                    if ( !connection.playing && q.isEmpty() ) {
                        debugLog("Disconnecting from VC...", connection.channelID);
                        bot.leaveVoiceChannel(connection.channelID);
                    }
                }, 30000);
            }
        })
        
        
        

        
    // Bot is playing something, so display the song that was queued
    } else {
        try {
            const info = await ytdl.getBasicInfo(url, {
                requestOptions: {
                    headers: {
                        cookie: COOKIE,
                    },
                },
            });
            bot.createMessage(textChannelID, {
                embed: {
                    description: `Queued:  [${info.videoDetails.title}](${q.end()})`
                }
            });
        } catch(err) {
            throwError("Youtube Fetch", err);
            bot.createMessage(textChannelID, {
                embed: {
                    description: `Problem fetching info.`
                }
            });
            q.pop();
        }
    }
    
}

// Prints the error with the time & date
function throwError(type, error) {
    var time = new Date();
    console.error(`\n${type} Error\n${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`);
    console.error(error);
    console.error('\n');
}

function debugLog(message, info) {
    if (debug) {
        let buffer = "";
        for(i = 60; i > message.length; i--) {
            buffer = buffer + " ";
        }
        var time = new Date();
        console.log(`${message}${buffer}${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`);
        if (info != null)
            console.log(info);
    }
}

function getQueue( guild ) {
    if ( !guildQueues.has(guild) ) {
        var q = new Queue;
        guildQueues.set( guild, q );
    }
    return guildQueues.get(guild);
}

function Queue() {
    this.elements = [];
}

Queue.prototype.enqueue = function (e) {
    this.elements.push(e);
}

Queue.prototype.dequeue = function () {
    return this.elements.shift();
}

Queue.prototype.push = function (e) {
    this.elements.unshift(e);
}

Queue.prototype.pop = function () {
    return this.elements.pop();
}


Queue.prototype.isEmpty = function () {
    return this.elements.length == 0;
}

Queue.prototype.peek = function () { 
    return !this.isEmpty() ? this.elements[0] : undefined;
}

Queue.prototype.end = function () {
    return !this.isEmpty() ? this.elements[this.elements.length - 1] : undefined;
}

Queue.prototype.remove = function (n) {
    return this.elements.splice(n-1, 1);
}

Queue.prototype.clear = function () {
    this.elements = [];
}

Queue.prototype.get = function (n) {
    return this.elements[n];
}

Queue.prototype.size = function () {
    return this.elements.length;
}


bot.connect();
