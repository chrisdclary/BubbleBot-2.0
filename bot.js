const COMMAND_PREFIX = '.';

const auth = require('./auth.json');
const Eris = require('eris');
const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const { Collection, Message } = require('eris');

const bot = new Eris(auth.token);

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
                    if ( ytdl.validateURL(args[0])){
                        // If they entered a valid youtube url, play that directly from ytdl
                        const connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                        if ( !connection ) { // join vc
                            join( textChannelID, msg.member, args[0], false, msg.guildID );
                        } else { // play song
                            var q = getQueue( msg.guildID );
                            q.enqueue(args[0]);
                            debugLog("Added a song to the queue");
                            play( connection, textChannelID, args[0], msg.guildID );
                        }
                    } else {
                        // If they entered something else, search youtube
                        search(textChannelID, msg, args.join(' '), false);
                    }
                    
                } else {
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
                        if ( !connection ) { // join vc
                            join( textChannelID, msg.member, args[0], true, msg.guildID );
                        } else { // play song
                            var q = getQueue( msg.guildID );
                            q.push(args[0]);
                            debugLog("Added a song to the queue");
                            play( connection, textChannelID, args[0], msg.guildID );
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
                // bot.createMessage(textChannelID, {
                //     embed: {
                //         description: `Not a valid command. Type '.help' for a list of commands`
                //     }
                // });
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
                var connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                if ( !connection ) { // join vc
                    join( textChannelID, msg.member, searchResults[num-1], playnext, msg.guildID );
                } else { // play song
                    if ( playnext) {
                        var q = getQueue( msg.guildID );
                        q.push(searchResults[num-1]);
                    } else {
                        var q = getQueue( msg.guildID );
                        q.enqueue(searchResults[num-1]);
                    }
                    debugLog("Added song to queue");
                    play( connection, textChannelID, searchResults[num-1], msg.guildID );
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
        message += `${i+1} - [${videos[i].title}](${videos[i].url})\n`;
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
        // Push to front or back of queue depending if this was invoked by playnext
        if( playnext ) {
            q.push(url);
        } else {
            q.enqueue(url);
        }
        
        debugLog("Added song to the queue");

        const connection = bot.joinVoiceChannel(voiceChannel);
        debugLog("Joined VC");

        connection
        .then( (connection) => {
            play( connection, textChannelID, url, guildID );

            // Create event listener for connection errors
            connection.on("error", async (err) => {
                throwError("Connection", err);
            })
        })
        .catch( (err) => {
            throwError("Join", err);
        })


    } else {
        bot.createMessage(textChannelID, {
            embed: {
                description: `Join a voice channel to play music.`
            }
        });
    }
}

async function play( connection, textChannelID, url, guildID ) {

    var q = getQueue( guildID );

    // Play the next song in the queue if nothing is currently playing,
    // Otherwise respond that the song has been added to the queue
    if ( !connection.playing ) {
        var nowPlaying;
        debugLog("Connection free, starting to play...");
        try {
            
            // Get title for next song in the queue
            debugLog("Getting video info...");

            const info = ytdl.getBasicInfo(q.peek());

            info
            .then( async (info) => {

                // Display the current song
                nowPlaying = await bot.createMessage(textChannelID, {
                    embed: {
                        description: `Now playing:  [${info.videoDetails.title}](${q.peek()})`
                    }
                });
            })
            .catch( (err) => {
                throwError("Fetch", err);
                play( connection, textChannelID, url, guildID );
            })
            

            // Download the next song in the queue and play it
            const stream = ytdl(q.peek(), { filter: "audioonly", highWaterMark: 1<<21, dlChunkSize: 1<<30 }).on('response', () => {

                if ( !connection ){
                    debugLog("Connection not found");
                    return;
                }

                // Retry connection a few times if it's not ready
                var retries = 15;
                while ( !connection.ready && retries-- > 0) {
                    debugLog("Connection not ready. Retrying...");
                }
                
                if ( connection.ready ) {
                    debugLog("Connection ready after " + (15 - retries) + " retries.");
                    try {
                        debugLog("Playing song...");
                        connection.play(stream);
                        // If song starts playing without error, remove it from the queue
                        debugLog("Removed song from queue")
                        q.dequeue();
                        
                    } catch ( err ) {
                        throwError("Player", err);
                    }
                } else {
                    debugLog("Connection not ready");
                }
            });
            
    
            // When a song ends, play the next song in the queue if there is one,
            // Otherwise, leave the voice channel
            connection.once('end', () => {
                debugLog("Reached end of song");    
                bot.deleteMessage( textChannelID, nowPlaying.id ).catch( (err) => {
                    throwError("Delete", err);
                });
                if ( !q.isEmpty() ){
                    debugLog("Playing next song in queue");
                    play( connection, textChannelID, q.peek(), guildID );
                } else {
                    bot.leaveVoiceChannel(connection.channelID);
                    debugLog("Disconnected from VC");
                }
            })
        
        // If there's an error while getting song info, it could be an age restricted video
        } catch ( err ) {
            throwError("Youtube Fetch", err);
            bot.createMessage(textChannelID, {
                embed: {
                    description: `Problem fetching info, video might be age-restricted.`
                }
            });
            // Remove it from the queue so it doesn't cause problems
            q.dequeue();
            if ( q.isEmpty )
                bot.leaveVoiceChannel(connection.channelID);
        }
        

        
    // Bot is playing something, so display the song that was queued
    } else {
        try {
            const info = await ytdl.getBasicInfo(url);
            bot.createMessage(textChannelID, {
                embed: {
                    description: `Queued:  [${info.videoDetails.title}](${q.end()})`
                }
            });
        // Again, error with song info is probably an age restricted video
        } catch(err) {
            throwError("Youtube Fetch", err);
            bot.createMessage(textChannelID, {
                embed: {
                    description: `Problem fetching info, video might be age-restricted.`
                }
            });
            q.pop();
        }
    }
    
}

// Prints the error with the time & date
function throwError(type, error) {
    var time = new Date();
    console.error(`${type} Error\n${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`);
    console.error(error);
}

function debugLog(info) {
    if (debug) {
        let buffer = "";
        for(i = 60; i > info.length; i--) {
            buffer = buffer + " ";
        }
        var time = new Date();
        console.log(`${info}${buffer}${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`);
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
