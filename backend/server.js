const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { CONTEXT } = require('./context');
dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(express.json());

// Serve the images directory as static
app.use('/images', express.static(path.join(__dirname, 'images')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Create a directory for static images
const imagesDir = path.join(__dirname, 'images');

// Function to load image names from the images directory
async function loadImageNames() {
  try {
    const files = await fs.readdir(imagesDir);
    return files.filter(file => file.match(/\.(jpg|jpeg|png|gif)$/i));
  } catch (error) {
    console.error('Error loading image names:', error);
    return [];
  }
}

let imageNames = [];
let context = '';

// Initialize server
async function initializeServer() {
  imageNames = await loadImageNames();
  context = CONTEXT;
}

const sessionConversations = {};

function getOrCreateSessionConversation(sessionId) {
  if (!sessionConversations[sessionId]) {
    sessionConversations[sessionId] = [{ role: "system", content: context }];
  }
  return sessionConversations[sessionId];
}

// Initialize server
async function initializeServer() {
  imageNames = await loadImageNames();
  context = CONTEXT;

  app.post('/chat', async (req, res) => {
    console.log('Received chat request:', req.body);
    try {
      const { message, sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }
      
      const conversationHistory = getOrCreateSessionConversation(sessionId);
      
      // Convert the conversation history to the OpenAI API format
      const formattedHistory = conversationHistory.map(msg => {
        if (msg.role === 'system') {
          return msg;
        }
        return {
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        };
      });

      // Add the new user message
      formattedHistory.push({ role: 'user', content: message });

      // Modify the OpenAI API call to request an image name
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: formattedHistory
      });

      const botMessageText = response.choices[0].message.content;
      console.log("Bot message:", botMessageText);

      // Select a random image from the imageNames array
      const randomIndex = Math.floor(Math.random() * imageNames.length);
      const imageName = imageNames[randomIndex];
      console.log(`Randomly selected image: ${imageName}`);

      // Add the bot's response to the conversation history
      conversationHistory.push({ sender: 'bot', text: botMessageText });

      // Text-to-speech using Google API
      const ttsResponse = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`,
        {
          input: { text: botMessageText },
          voice: { languageCode: 'en-US', name: 'en-US-Wavenet-F' },
          audioConfig: { audioEncoding: 'MP3' },
        }
      );

      const audioContent = ttsResponse.data.audioContent;
      
      // Update the response to include the randomly selected image file
      const imageUrl = `/images/${imageName}`; // URL to the image
      res.json({ 
        text: botMessageText, 
        audio: audioContent,
        image: {
          name: imageName,
          url: imageUrl
        }
      });
    } catch (error) {
      console.error('Error in /chat endpoint:', error);
      res.status(500).json({ error: 'An error occurred', details: error.message });
    }
  });

  app.post('/speech-to-text', async (req, res) => {
    try {
      const { audio } = req.body;
      const sttResponse = await axios.post(
        `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`,
        {
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
          },
          audio: { content: audio },
        }
      );
      
      const transcription = sttResponse.data.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      
      res.json({ transcription });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'An error occurred' });
    }
  });

  app.post('/export-conversation', async (req, res) => {
    try {
      const fileName = `conversation_${Date.now()}.json`;
      const filePath = path.join(__dirname, 'conversations', fileName);
      
      // Convert the conversation history to the OpenAI API format
      const formattedHistory = conversationHistory.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      }));
      
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(formattedHistory, null, 2));
      
      res.json({ fileName });
    } catch (error) {
      console.error('Error exporting conversation:', error);
      res.status(500).json({ error: 'An error occurred while exporting the conversation' });
    }
  });

  app.post('/import-conversation', upload.single('file'), async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const filePath = req.file.path;
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const importedConversation = JSON.parse(fileContent);
      
      // Check if the imported conversation is in the old format or new format
      const isOldFormat = importedConversation[0] && 'sender' in importedConversation[0];
      
      // Convert to the format used by the application
      const formattedConversation = isOldFormat
        ? importedConversation.map(msg => ({
            sender: msg.sender,
            text: msg.text
          }))
        : importedConversation.map(msg => ({
            sender: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content
          }));
      
      // Update the session conversation with the imported data
      sessionConversations[sessionId] = [
        { role: 'system', content: context },
        ...formattedConversation
      ];
      
      await fs.unlink(filePath); // Delete the uploaded file after processing
      
      res.json({ message: 'Conversation imported successfully', conversation: formattedConversation });
    } catch (error) {
      console.error('Error importing conversation:', error);
      res.status(500).json({ error: 'An error occurred while importing the conversation' });
    }
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Run the server
initializeServer().catch(console.error);