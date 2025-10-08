# Telegram Media Scheduler Bot

A Telegram bot that allows an admin to add videos and images, and users to schedule automatic media sending in groups.

## Features

1. Admin can add videos and images to the bot's collection
2. Users can add the bot to groups/channels
3. Users can schedule the bot to send media at set intervals
4. Users can choose what type of media they want to receive:
   - Videos only
   - Images only
   - Mix of videos and images
5. Media sent are from the admin's collection
6. Admin can delete individual or multiple videos and images from the collection
7. No duplicate media is sent until all items have been sent once (non-repeating random)
8. After all media is sent, the cycle repeats

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram and get the bot token
2. Get your Telegram user ID (you can use [@userinfobot](https://t.me/userinfobot) for this)
3. Update the [.env](file:///G:/botx/.env) file with your bot token and user ID:
   ```
   BOT_TOKEN=your_bot_token_here
   ADMIN_ID=your_telegram_user_id_here
   ```
4. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Admin Commands
- `/addvideo` - Add a video to the collection (send the video after using this command)
- `/addimage` - Add an image to the collection (send the image after using this command)
- `/listvideos` - List all videos in the collection (with delete links)
- `/listimages` - List all images in the collection (with delete links)
- `/deletevideos start-end or index1,index2,...` - Delete multiple videos
- `/deleteimages start-end or index1,index2,...` - Delete multiple images
- `/listmedia` - Show total count of all media
- `/help` - Show help message

### User Commands (in groups)
- `/schedule` - Schedule media sending (bot will ask for media type and interval)
- `/stop` - Stop scheduled media sending
- `/help` - Show this help message

## How Media Sending Works

The bot implements a non-repeating random system to ensure variety:

1. When media is scheduled, the bot sends items randomly but avoids duplicates
2. Each item is sent only once until all items of the selected type have been sent
3. After all items have been sent, the cycle resets and all items become available again
4. This ensures that all media gets distributed evenly over time

## How to Delete Media

As an admin, you can delete individual or multiple videos and images from your collection:

### Single Item Deletion:
1. Use `/listvideos` or `/listimages` to see all media with delete links
2. Each media item will have a delete command like `/deletevideo_0` or `/deleteimage_2`
3. Click or type the delete command to remove that specific media item

### Multiple Item Deletion:
You can delete multiple videos or images using two methods:

1. **Delete a range of items**:
   - Use `/deletevideos 1-3` to delete videos 1 through 3
   - Use `/deleteimages 2-5` to delete images 2 through 5

2. **Delete specific items**:
   - Use `/deletevideos 1,3,5` to delete videos 1, 3, and 5
   - Use `/deleteimages 2,4,6,8` to delete images 2, 4, 6, and 8

### Examples:
- `/deletevideos 1-5` - Deletes the first 5 videos
- `/deleteimages 3,7,9` - Deletes images 3, 7, and 9
- `/deletevideos 2-4` - Deletes videos 2, 3, and 4

The bot will confirm when the media has been successfully deleted.

## Running the Bot

### Production
```bash
npm start
```

### Development
```bash
npm run dev
```

## How It Works

1. Admin uses `/addvideo` or `/addimage` command and then sends media to add it to the collection
2. Users add the bot to a group
3. Users use `/schedule` command and:
   - Select what type of media they want (videos, images, or mix)
   - Specify the interval (in minutes) for sending media
4. Bot will automatically send media items from the admin's collection at the specified interval
   - Ensures no duplicates until all items have been sent
   - After all items are sent, the cycle repeats
5. Users can use `/stop` to stop the scheduled media sending

## Data Storage

- Videos are stored in `data/videos.json`
- Images are stored in `data/images.json`
- Schedules are stored in `data/schedules.json`

The bot automatically creates these files and directories when it starts.