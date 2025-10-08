require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const fs = require('fs-extra');
const path = require('path');
const schedule = require('node-schedule');

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

// Check if environment variables are set
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

if (!ADMIN_ID) {
  console.error('ADMIN_ID is not set in environment variables');
  process.exit(1);
}

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
fs.ensureDirSync(dataDir);

// File paths for storing data
const videosFile = path.join(dataDir, 'videos.json');
const imagesFile = path.join(dataDir, 'images.json');
const schedulesFile = path.join(dataDir, 'schedules.json');

// Initialize data files if they don't exist
if (!fs.existsSync(videosFile)) {
  fs.writeJsonSync(videosFile, []);
}

if (!fs.existsSync(imagesFile)) {
  fs.writeJsonSync(imagesFile, []);
}

if (!fs.existsSync(schedulesFile)) {
  fs.writeJsonSync(schedulesFile, {});
}

// Load data
let videos = fs.readJsonSync(videosFile);
let images = fs.readJsonSync(imagesFile);
let schedules = {}; // We'll store schedule data separately from job objects
let scheduleData = fs.readJsonSync(schedulesFile);

// Store for tracking sent media per chat (to avoid duplicates until all are sent)
let sentMediaTracking = {};

// Recreate scheduled jobs from saved data
for (const chatId in scheduleData) {
  createScheduledJob(chatId, scheduleData[chatId].interval, scheduleData[chatId].mediaType);
}

// Helper function to save videos
function saveVideos() {
  fs.writeJsonSync(videosFile, videos);
}

// Helper function to save images
function saveImages() {
  fs.writeJsonSync(imagesFile, images);
}

// Helper function to save schedule data (without job objects)
function saveScheduleData() {
  fs.writeJsonSync(schedulesFile, scheduleData);
}

// Function to get next unsent media item
function getNextUnsentMedia(chatId, mediaList) {
  // Initialize tracking for this chat if it doesn't exist
  if (!sentMediaTracking[chatId]) {
    sentMediaTracking[chatId] = new Set();
  }
  
  // Filter out already sent media
  const unsentMedia = mediaList.filter((media, index) => !sentMediaTracking[chatId].has(index));
  
  // If all media has been sent, reset tracking and use all media
  if (unsentMedia.length === 0) {
    sentMediaTracking[chatId].clear();
    // Return a random item from the full list
    return mediaList[Math.floor(Math.random() * mediaList.length)];
  }
  
  // Return a random item from unsent media
  const selectedMedia = unsentMedia[Math.floor(Math.random() * unsentMedia.length)];
  
  // Mark this media as sent
  const index = mediaList.indexOf(selectedMedia);
  sentMediaTracking[chatId].add(index);
  
  return selectedMedia;
}

// Function to create a scheduled job
function createScheduledJob(chatId, interval, mediaType) {
  // Cancel existing job if it exists
  if (schedules[chatId]) {
    schedules[chatId].cancel();
  }
  
  // Create new job - run every 'interval' minutes
  const job = schedule.scheduleJob({ minute: new schedule.Range(0, 59, interval) }, () => {
    console.log('Sending media to chat ' + chatId + ' at ' + new Date().toISOString());
    
    let mediaToSend = [];
    
    // Select media based on user preference
    switch(mediaType) {
      case 'videos':
        mediaToSend = videos;
        break;
      case 'images':
        mediaToSend = images;
        break;
      case 'mix':
        mediaToSend = [...videos, ...images];
        break;
    }
    
    // Send a random media item (avoiding duplicates until all are sent)
    if (mediaToSend.length > 0) {
      const randomMedia = getNextUnsentMedia(chatId, mediaToSend);
      console.log('Sending ' + randomMedia.type + ' with ID: ' + randomMedia.id);
      
      if (randomMedia.type === 'video') {
        bot.telegram.sendVideo(chatId, randomMedia.id, {
          caption: randomMedia.caption
        }).catch((error) => {
          console.error('Error sending video to chat ' + chatId + ':', error);
        });
      } else if (randomMedia.type === 'image') {
        bot.telegram.sendPhoto(chatId, randomMedia.id, {
          caption: randomMedia.caption
        }).catch((error) => {
          console.error('Error sending image to chat ' + chatId + ':', error);
        });
      }
    } else {
      console.log('No media to send for chat ' + chatId);
    }
  });
  
  // Store job object and schedule data separately
  schedules[chatId] = job;
  scheduleData[chatId] = { 
    interval: interval, 
    mediaType: mediaType,
    createdAt: new Date().toISOString() 
  };
  saveScheduleData();
  
  console.log('Scheduled job for chat ' + chatId + ' every ' + interval + ' minutes for ' + mediaType);
}

// Middleware to check if user is admin
bot.use((ctx, next) => {
  ctx.isAdmin = ctx.from && ctx.from.id.toString() === ADMIN_ID;
  return next();
});

// Enable session middleware
bot.use(session());

// Start command
bot.start((ctx) => {
  if (ctx.isAdmin) {
    ctx.reply('Hello admin! You can use /addvideo or /addimage to add media that will be sent to groups.');
  } else {
    ctx.reply('Hello! Add me to a group and use /schedule to set up automatic media sending.');
  }
});

// Admin command to add video
bot.command('addvideo', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  ctx.reply('Please send the video you want to add to the bot.');
});

// Admin command to add image
bot.command('addimage', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  ctx.reply('Please send the image you want to add to the bot.');
});

// Handle video messages from admin
bot.on('video', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('Only admin can add videos.');
  }

  const videoId = ctx.message.video.file_id;
  const caption = ctx.message.caption || '';

  // Check if video already exists
  const existingVideoIndex = videos.findIndex(video => video.id === videoId);
  
  if (existingVideoIndex !== -1) {
    // Video already exists
    const existingVideo = videos[existingVideoIndex];
    const addedDate = new Date(existingVideo.addedAt).toLocaleString();
    return ctx.reply(`This video already exists in the collection!\nIt was added on: ${addedDate}\nUse /listvideos to see all videos.`);
  }

  // Add video to our collection
  videos.push({
    id: videoId,
    type: 'video',
    caption: caption,
    addedAt: new Date().toISOString()
  });

  saveVideos();

  ctx.reply('Video added successfully! Now you can use /listvideos to see all videos.');
});

// Handle photo messages from admin
bot.on('photo', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('Only admin can add images.');
  }

  // Get the highest quality photo
  const photos = ctx.message.photo;
  const photoId = photos[photos.length - 1].file_id;
  const caption = ctx.message.caption || '';

  // Check if image already exists
  const existingImageIndex = images.findIndex(image => image.id === photoId);
  
  if (existingImageIndex !== -1) {
    // Image already exists
    const existingImage = images[existingImageIndex];
    const addedDate = new Date(existingImage.addedAt).toLocaleString();
    return ctx.reply(`This image already exists in the collection!\nIt was added on: ${addedDate}\nUse /listimages to see all images.`);
  }

  // Add image to our collection
  images.push({
    id: photoId,
    type: 'image',
    caption: caption,
    addedAt: new Date().toISOString()
  });

  saveImages();

  ctx.reply('Image added successfully! Now you can use /listimages to see all images.');
});

// Admin command to list videos
bot.command('listvideos', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  if (videos.length === 0) {
    return ctx.reply('No videos added yet.');
  }

  let message = 'Videos:\n\n';
  videos.forEach((video, index) => {
    message += (index + 1) + '. Added at: ' + new Date(video.addedAt).toLocaleString() + '\n';
    if (video.caption) {
      message += '   Caption: ' + video.caption + '\n';
    }
    // Add delete button for each video
    message += '   Delete: /deletevideo_' + index + '\n';
    message += '\n';
  });

  message += '\nTo delete multiple videos, use: /deletevideos start-end (e.g., /deletevideos 1-3)\n';
  message += 'To delete specific videos, use: /deletevideos index1,index2,index3 (e.g., /deletevideos 1,3,5)\n';

  ctx.reply(message);
});

// Admin command to list images
bot.command('listimages', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  if (images.length === 0) {
    return ctx.reply('No images added yet.');
  }

  let message = 'Images:\n\n';
  images.forEach((image, index) => {
    message += (index + 1) + '. Added at: ' + new Date(image.addedAt).toLocaleString() + '\n';
    if (image.caption) {
      message += '   Caption: ' + image.caption + '\n';
    }
    // Add delete button for each image
    message += '   Delete: /deleteimage_' + index + '\n';
    message += '\n';
  });

  message += '\nTo delete multiple images, use: /deleteimages start-end (e.g., /deleteimages 1-3)\n';
  message += 'To delete specific images, use: /deleteimages index1,index2,index3 (e.g., /deleteimages 1,3,5)\n';

  ctx.reply(message);
});

// Admin command to delete a video by index
bot.command('deletevideo', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  // Extract index from command
  const parts = ctx.message.text.split('_');
  if (parts.length !== 2 || isNaN(parts[1])) {
    return ctx.reply('Invalid command. Use the delete links provided in /listvideos');
  }

  const index = parseInt(parts[1]);
  
  if (index < 0 || index >= videos.length) {
    return ctx.reply('Invalid video index. Please use /listvideos to see valid indices.');
  }

  // Remove video
  const deletedVideo = videos.splice(index, 1)[0];
  saveVideos();

  ctx.reply('Video deleted successfully!');
});

// Admin command to delete an image by index
bot.command('deleteimage', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  // Extract index from command
  const parts = ctx.message.text.split('_');
  if (parts.length !== 2 || isNaN(parts[1])) {
    return ctx.reply('Invalid command. Use the delete links provided in /listimages');
  }

  const index = parseInt(parts[1]);
  
  if (index < 0 || index >= images.length) {
    return ctx.reply('Invalid image index. Please use /listimages to see valid indices.');
  }

  // Remove image
  const deletedImage = images.splice(index, 1)[0];
  saveImages();

  ctx.reply('Image deleted successfully!');
});

// Admin command to delete multiple videos
bot.command('deletevideos', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  if (videos.length === 0) {
    return ctx.reply('No videos to delete.');
  }

  const text = ctx.message.text.substring('/deletevideos '.length).trim();
  
  if (!text) {
    return ctx.reply('Please specify videos to delete. Examples:\n/deletevideos 1-3 (deletes videos 1 to 3)\n/deletevideos 1,3,5 (deletes videos 1, 3, and 5)');
  }

  let indicesToDelete = [];
  
  // Check if it's a range (e.g., 1-3)
  if (text.includes('-')) {
    const range = text.split('-');
    if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
      const start = parseInt(range[0]) - 1; // Convert to 0-based index
      const end = parseInt(range[1]) - 1;   // Convert to 0-based index
      
      if (start >= 0 && end < videos.length && start <= end) {
        for (let i = start; i <= end; i++) {
          indicesToDelete.push(i);
        }
      } else {
        return ctx.reply('Invalid range. Please check the indices and try again.');
      }
    } else {
      return ctx.reply('Invalid range format. Use: /deletevideos start-end (e.g., /deletevideos 1-3)');
    }
  } 
  // Check if it's a list of indices (e.g., 1,3,5)
  else if (text.includes(',')) {
    const indices = text.split(',');
    for (const index of indices) {
      const idx = parseInt(index.trim()) - 1; // Convert to 0-based index
      if (idx >= 0 && idx < videos.length) {
        indicesToDelete.push(idx);
      }
    }
    
    if (indicesToDelete.length !== indices.length) {
      return ctx.reply('One or more indices are invalid. Please check and try again.');
    }
  } 
  // Check if it's a single index
  else if (!isNaN(text)) {
    const index = parseInt(text) - 1; // Convert to 0-based index
    if (index >= 0 && index < videos.length) {
      indicesToDelete.push(index);
    } else {
      return ctx.reply('Invalid index. Please check and try again.');
    }
  } else {
    return ctx.reply('Invalid format. Examples:\n/deletevideos 1-3 (deletes videos 1 to 3)\n/deletevideos 1,3,5 (deletes videos 1, 3, and 5)');
  }

  // Sort indices in descending order to avoid index shifting issues when deleting
  indicesToDelete.sort((a, b) => b - a);
  
  // Delete videos
  const deletedVideos = [];
  for (const index of indicesToDelete) {
    const deletedVideo = videos.splice(index, 1)[0];
    deletedVideos.push(deletedVideo);
  }
  
  saveVideos();
  
  ctx.reply('Successfully deleted ' + deletedVideos.length + ' video(s)!');
});

// Admin command to delete multiple images
bot.command('deleteimages', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  if (images.length === 0) {
    return ctx.reply('No images to delete.');
  }

  const text = ctx.message.text.substring('/deleteimages '.length).trim();
  
  if (!text) {
    return ctx.reply('Please specify images to delete. Examples:\n/deleteimages 1-3 (deletes images 1 to 3)\n/deleteimages 1,3,5 (deletes images 1, 3, and 5)');
  }

  let indicesToDelete = [];
  
  // Check if it's a range (e.g., 1-3)
  if (text.includes('-')) {
    const range = text.split('-');
    if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
      const start = parseInt(range[0]) - 1; // Convert to 0-based index
      const end = parseInt(range[1]) - 1;   // Convert to 0-based index
      
      if (start >= 0 && end < images.length && start <= end) {
        for (let i = start; i <= end; i++) {
          indicesToDelete.push(i);
        }
      } else {
        return ctx.reply('Invalid range. Please check the indices and try again.');
      }
    } else {
      return ctx.reply('Invalid range format. Use: /deleteimages start-end (e.g., /deleteimages 1-3)');
    }
  } 
  // Check if it's a list of indices (e.g., 1,3,5)
  else if (text.includes(',')) {
    const indices = text.split(',');
    for (const index of indices) {
      const idx = parseInt(index.trim()) - 1; // Convert to 0-based index
      if (idx >= 0 && idx < images.length) {
        indicesToDelete.push(idx);
      }
    }
    
    if (indicesToDelete.length !== indices.length) {
      return ctx.reply('One or more indices are invalid. Please check and try again.');
    }
  } 
  // Check if it's a single index
  else if (!isNaN(text)) {
    const index = parseInt(text) - 1; // Convert to 0-based index
    if (index >= 0 && index < images.length) {
      indicesToDelete.push(index);
    } else {
      return ctx.reply('Invalid index. Please check and try again.');
    }
  } else {
    return ctx.reply('Invalid format. Examples:\n/deleteimages 1-3 (deletes images 1 to 3)\n/deleteimages 1,3,5 (deletes images 1, 3, and 5)');
  }

  // Sort indices in descending order to avoid index shifting issues when deleting
  indicesToDelete.sort((a, b) => b - a);
  
  // Delete images
  const deletedImages = [];
  for (const index of indicesToDelete) {
    const deletedImage = images.splice(index, 1)[0];
    deletedImages.push(deletedImage);
  }
  
  saveImages();
  
  ctx.reply('Successfully deleted ' + deletedImages.length + ' image(s)!');
});

// Admin command to list all media
bot.command('listmedia', (ctx) => {
  if (!ctx.isAdmin) {
    return ctx.reply('You are not authorized to use this command.');
  }

  const totalMedia = videos.length + images.length;
  ctx.reply('Total media: ' + totalMedia + '\nVideos: ' + videos.length + '\nImages: ' + images.length);
});

// Command for users to schedule media sending
bot.command('schedule', (ctx) => {
  const chatId = ctx.chat.id;
  
  // Check if this is a group or private chat
  if (ctx.chat.type === 'private') {
    return ctx.reply('This command is meant to be used in groups where the bot is added.');
  }

  // Check if there are any media items
  if (videos.length === 0 && images.length === 0) {
    return ctx.reply('No media available. Please ask the admin to add some videos or images first.');
  }

  // Ask user what type of media they want
  ctx.reply('What type of media would you like to receive?\n1. Videos only (/videos)\n2. Images only (/images)\n3. Mix of videos and images (/mix)', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Videos', callback_data: 'videos' }],
        [{ text: 'Images', callback_data: 'images' }],
        [{ text: 'Mix', callback_data: 'mix' }]
      ]
    }
  });
});

// Handle callback queries for media type selection
bot.action(['videos', 'images', 'mix'], (ctx) => {
  // Initialize session if it doesn't exist
  if (!ctx.session) {
    ctx.session = {};
  }
  
  ctx.session.selectedMediaType = ctx.match[0];
  ctx.reply('Please specify the interval in minutes for sending media (e.g., 30 for every 30 minutes):');
  
  // Acknowledge the button press
  ctx.answerCbQuery();
});

// Handle text messages (for interval input)
bot.on('text', (ctx) => {
  const chatId = ctx.chat.id;
  
  console.log('Received text message: ' + ctx.message.text);
  console.log('Session data: ' + JSON.stringify(ctx.session));
  
  // Check if we're waiting for interval input
  if (ctx.session && ctx.session.selectedMediaType && 
      ctx.message.text && !isNaN(ctx.message.text) && parseInt(ctx.message.text) > 0) {
    const interval = parseInt(ctx.message.text);
    const mediaType = ctx.session.selectedMediaType;
    
    console.log('Creating scheduled job with interval: ' + interval + ' and mediaType: ' + mediaType);
    
    // Create scheduled job
    createScheduledJob(chatId, interval, mediaType);
    
    // Clear session
    delete ctx.session.selectedMediaType;
    
    let mediaTypeName = '';
    switch(mediaType) {
      case 'videos':
        mediaTypeName = 'videos';
        break;
      case 'images':
        mediaTypeName = 'images';
        break;
      case 'mix':
        mediaTypeName = 'mixed videos and images';
        break;
    }
    
    ctx.reply('Scheduled! I will send ' + mediaTypeName + ' every ' + interval + ' minutes. Use /stop to stop sending media.');
  } else if (ctx.session && ctx.session.selectedMediaType) {
    // If we're waiting for interval but didn't get a valid number
    ctx.reply('Please enter a valid number for the interval (in minutes):');
  }
});

// Command to stop scheduled media sending
bot.command('stop', (ctx) => {
  const chatId = ctx.chat.id.toString(); // Ensure chatId is a string for consistent comparison
  
  console.log('Stop command received in chat:', chatId);
  console.log('Current schedules:', Object.keys(schedules));
  console.log('Current scheduleData:', Object.keys(scheduleData));
  
  if (ctx.chat.type === 'private') {
    return ctx.reply('This command is meant to be used in groups where the bot is added.');
  }
  
  // Check if there's a scheduled job for this chat
  if (schedules[chatId]) {
    schedules[chatId].cancel();
    delete schedules[chatId];
    delete scheduleData[chatId];
    saveScheduleData();
    
    // Also clear sent media tracking for this chat
    delete sentMediaTracking[chatId];
    
    ctx.reply('Stopped scheduled media sending.');
    console.log('Successfully stopped scheduled media sending for chat:', chatId);
  } else if (scheduleData[chatId]) {
    // Handle case where job might not be in memory but is in data file
    delete scheduleData[chatId];
    saveScheduleData();
    
    // Also clear sent media tracking for this chat
    delete sentMediaTracking[chatId];
    
    ctx.reply('Stopped scheduled media sending.');
    console.log('Successfully stopped scheduled media sending for chat (from data only):', chatId);
  } else {
    ctx.reply('No scheduled media sending found for this group.');
    console.log('No scheduled media sending found for chat:', chatId);
  }
});

// Help command
bot.command('help', (ctx) => {
  if (ctx.isAdmin) {
    ctx.reply(
      'Admin commands:\n' +
      '/addvideo - Add a video to the collection\n' +
      '/addimage - Add an image to the collection\n' +
      '/listvideos - List all videos in the collection (with delete links)\n' +
      '/listimages - List all images in the collection (with delete links)\n' +
      '/deletevideos start-end or index1,index2,... - Delete multiple videos\n' +
      '/deleteimages start-end or index1,index2,... - Delete multiple images\n' +
      '/listmedia - Show total count of all media\n\n' +
      'User commands (in groups):\n' +
      '/schedule - Schedule media sending\n' +
      '/stop - Stop scheduled media sending\n' +
      '/help - Show this help message'
    );
  } else {
    ctx.reply(
      'User commands (in groups):\n' +
      '/schedule - Schedule media sending\n' +
      '/stop - Stop scheduled media sending\n' +
      '/help - Show this help message'
    );
  }
});

// Launch bot
bot.launch();

console.log('Bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));