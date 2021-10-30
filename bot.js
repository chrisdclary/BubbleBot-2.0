const COMMAND_PREFIX = '.';

const auth = require('./auth.json');
const Eris = require('eris');
const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const { Collection, Message } = require('eris');

const bot = new Eris(auth.token);

bot.on("ready", () => {
    var time = new Date();
    debugLog("Ready!")
});

let q = new Queue();

// Default debug mode: true (for now)
var debug = true;
var respond;
var searchResults = [];

bot.on("messageCreate", async msg => {

    var textChannel = msg.channel.id;

    if ( msg.author.bot )
        return;

    if ( msg.content.substring(0,1) == COMMAND_PREFIX ) {

        var args = msg.content.substring(1).split(' ');
        var cmd = args[0];
        args = args.splice(1);

        switch ( cmd ) {

            case 'hello':
                await bot.createMessage(textChannel, `Hello World!`);
                break;
            
            case 'clear': // clear the queue
                q.clear();
                bot.createMessage(textChannel, {
                    embed: {
                        description: `Queue cleared!`
                    }
                });
                break;
            
            // debug mode just prints more info to the console
            case 'debug':
                debug = !debug;
                if ( debug ){
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Turning debug mode on.`
                        }
                    });
                } else {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Turning debug mode off.`
                        }
                    });
                }
                break;
            
            case 'help':
                bot.createMessage(textChannel, {
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
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                } else {
                    showQueue(textChannel);
                }
                
                break;
            
            case 'r':
            case 'remove': // remove specific song from queue
                if ( q.isEmpty() ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Queue is empty.`
                        }
                    });
                    break;
                }
                var num = parseInt(args[0], 10);
                if ( isNaN(num) || num < 1 || q.size() < num ) {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Can't remove that from the queue.`
                        }
                    });
                } else {
                    remove(textChannel, num);
                }
                break;
            
            case 'skip': // skip current song
                connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                var voiceChannel = msg.member.voiceState.channelID;
                if ( !connection ) {
                    bot.createMessage(textChannel, {
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
                        bot.createMessage(textChannel, {
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
                        connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
                        if ( !connection ) { // join vc
                            join( textChannel, msg.member, args[0] );
                        } else { // play song
                            q.enqueue(args[0]);
                            debugLog("Added a song to the queue");
                            play( connection, textChannel, msg.member );
                        }
                    } else {
                        // If they entered something else, search youtube
                        search(textChannel, msg, args.join(' '));
                    }
                    
                } else {
                    bot.createMessage(textChannel, {
                        embed: {
                            description: `Proper usage: .play < search terms / youtube URL >`
                        }
                    });
                }
                
                break;
            default:
                bot.createMessage(textChannel, {
                    embed: {
                        description: `Not a valid command. Type '.help' for a list of commands`
                    }
                });
        }
    } 

    // If the user is responding to a search request
    else if ( respond != null && respond.author.id == msg.author.id && respond.channel.id == msg.channel.id ) {

        // User input
        var num = parseInt(msg.content, 10);

        // Number of search results
        var max = searchResults.length;

        // Make sure they are making a valid selection
        if ( isNaN(num) || num < 1 || num > max ) {
            bot.createMessage(textChannel, {
                embed: {
                    description: `Invalid selection.`
                }
            });
        } else {
            // Play the selected video as if they used the .play command
            respond = null;
            connection = bot.voiceConnections.find(conn => conn.id === msg.guildID);
            if ( !connection ) { // join vc
                join( textChannel, msg.member, searchResults[num-1] );
            } else { // play song
                q.enqueue(searchResults[num-1]);
                debugLog("Added song to queue");
                play( connection, textChannel, msg.member );
            }
            searchResults = [];
        }
    }
    
})

bot.on("error", (err) => {
    throwError("Bot", err);
})

// Search youtube for results and display the top 5
async function search( textChannel, msg, query ) {
    searchResults = [];
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
    bot.createMessage(textChannel, {
        embed: {
            title: "Search results",
            description: message
        }
    });
    respond = msg;

}

// Remove the requested song from the queue
async function remove( textChannel, n ) {
    const removed = q.remove(n);
    var info = await ytdl.getBasicInfo(removed);

    bot.createMessage(textChannel, {
        embed: {
            description: `Removed [${info.videoDetails.title}](${removed}) from the queue.`
        }
    });
}

// Display the queued songs in order
async function showQueue( textChannel ) {
    var message = ``;

    for ( i = 0; i < q.size(); i++ ) {
        var info = await ytdl.getBasicInfo(q.get(i));
        message += `${i+1}: [${info.videoDetails.title}](${q.get(i)})\n`;
        
    }
    bot.createMessage(textChannel, {
        embed: {
            title: "Queue",
            description: message
        }
    });
}

// Join the voice chat and queue the song, then play the queued song
async function join( textChannel, member, url) {

    var voiceChannel = member.voiceState.channelID;

    if ( voiceChannel != null ) {
        q.enqueue(url);
        debugLog("Added song to the queue");
        connection = await bot.joinVoiceChannel(voiceChannel);
        debugLog("Joined VC");
        play( connection, textChannel );

        // Create event listener for connection errors
        connection.on("error", async (err) => {
            throwError("Connection", err);
        })

    } else {
        bot.createMessage(textChannel, {
            embed: {
                description: `Join a voice channel to play music.`
            }
        });
    }
}

async function play( connection, textChannel ) {

    // Play the next song in the queue if nothing is currently playing,
    // Otherwise respond that the song has been added to the queue
    if( !connection.playing ) {
        debugLog("Connection free, starting to play...");
        try {
            // Get title for next song in the queue
            debugLog("Getting video info...");
            const info = await ytdl.getBasicInfo(q.peek());

            // Display the current song
            var nowPlaying = await bot.createMessage(textChannel, {
                embed: {
                    description: `Now playing:  [${info.videoDetails.title}](${q.peek()})`
                }
            });
            // Download the next song in the queue and play it
            const stream = ytdl(q.peek(), { filter: "audioonly", highWaterMark: 1<<21, dlChunkSize: 1<<30 }).on('response', () => {
                if ( !connection ){
                    debugLog("Connection not found");
                    return;
                }
                
                if ( connection.ready ) {
                    try {
                        debugLog("Playing song...");
                        connection.play(stream);
                        // If song starts playing without error, remove it from the queue
                        debugLog("Removed song from queue")
                        q.dequeue();
                        
                    } catch (error) {
                        throwError("Player", error);
                    }
                } else {
                    console.log("Connection not ready");
                }
            });

            //     stream.on('progress', (x, y, z) => {
            //         debugLog(`${x} - ${y} - ${z}`);
            //     })
            
    
            // When a song ends, play the next song in the queue if there is one,
            // Otherwise, leave the voice channel
            connection.once('end', () => {
                debugLog("Reached end of song");    
                bot.deleteMessage( textChannel, nowPlaying.id );
                if ( !q.isEmpty() ){
                    debugLog("Playing next song in queue");
                    play( connection, textChannel );
                } else {
                    bot.leaveVoiceChannel(connection.channelID);
                    debugLog("Disconnected from VC");
                }
            })
        
        // If there's an error while getting song info, it could be an age restricted video
        } catch(err) {
            throwError("Youtube Fetch", err);
            bot.createMessage(textChannel, {
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
            const info = await ytdl.getBasicInfo(q.end());
            bot.createMessage(textChannel, {
                embed: {
                    description: `Queued:  [${info.videoDetails.title}](${q.end()})`
                }
            });
        // Again, error with song info is probably an agre restricted video
        } catch(err) {
            throwError("Youtube Fetch", err);
            bot.createMessage(textChannel, {
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
    console.error(`${type} Error at ${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`);
    console.error(error);
}

function debugLog(info) {
    if (debug) {
        let buffer = "";
        for(i = 50; i > info.length; i--) {
            buffer = buffer + " ";
        }
        var time = new Date();
        console.log(`${info}${buffer}${time.getMonth() + 1}/${time.getDate()}/${time.getFullYear()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`);
    }
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
