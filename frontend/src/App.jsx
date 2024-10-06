import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import tempImg from './assets/getting_back_to_earth.jpg';
import micSvg from './assets/mic.svg';
import stopSvg from './assets/mic-off.svg';
import rocketSvg from './assets/rocket.svg';
import Header from './components/Header';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentTypingText, setCurrentTypingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [isResponseLoading, setIsResponseLoading] = useState(false);
  const chatContainerRef = useRef(null);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [thinkingText, setThinkingText] = useState('Thinking');
  const [currentImage, setCurrentImage] = useState(tempImg);

  const getAudioDuration = useCallback((audioBlob) => {
    return new Promise((resolve) => {
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
    });
  }, []);

  const typeText = useCallback((text, duration) => {
    resetTypingState(); // Clear existing text
    setIsTyping(true);
    const totalChars = text.length;
    const intervalTime = duration * 1000 / totalChars;
    
    let i = 0;
    const typingInterval = setInterval(() => {
      if (i <= totalChars) {
        setCurrentTypingText(text.slice(0, i));
        i++;
      } else {
        clearInterval(typingInterval);
        setIsTyping(false);
        setIsTypingComplete(true);
      }
    }, intervalTime);
  }, []);

  const resetTypingState = useCallback(() => {
    setIsTyping(false);
    setCurrentTypingText('');
    setIsTypingComplete(false);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (inputMessage.trim() !== '') {
      const userMessage = { text: inputMessage, sender: 'user' };
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInputMessage('');
      setIsLoading(true);
      setIsResponseLoading(true);
      resetTypingState();

      try {
        const response = await fetch('http://localhost:3001/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: inputMessage }),
        });
        const data = await response.json();
        console.log('Received data from server:', data);

        setIsResponseLoading(false);

        const audioBlob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = await getAudioDuration(audioBlob);

        typeText(data.text, duration);
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();
        }

        // Handle the image
        if (data.image && data.image.url) {
          console.log('Setting image URL:', `http://localhost:3001${data.image.url}`);
          setCurrentImage(`http://localhost:3001${data.image.url}`);
        } else {
          console.log('No image data received');
        }
      } catch (error) {
        console.error('Error:', error);
        const errorMessage = { text: "Sorry, I couldn't process your request.", sender: 'bot' };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
        setIsLoading(false);
        setIsResponseLoading(false);
        resetTypingState();
      }
    }
  }, [inputMessage, resetTypingState, typeText, getAudioDuration]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = handleRecordingStop;

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleRecordingStop = useCallback(async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const audioBase64 = await blobToBase64(audioBlob);

    try {
      const response = await fetch('http://localhost:3001/speech-to-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: audioBase64.split(',')[1] }),
      });
      const data = await response.json();

      if (data.transcription) {
        console.log('Transcription:', data.transcription);
        setInputMessage(data.transcription);
      } else {
        console.log('No transcription results');
      }
    } catch (error) {
      console.error('Error in speech-to-text:', error);
    }
  }, []);

  const blobToBase64 = useCallback((blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  const handleExport = useCallback(() => {
    try {
      // Create a JSON string of the messages
      const conversationData = JSON.stringify(messages, null, 2);
      
      // Create a Blob with the JSON data
      const blob = new Blob([conversationData], { type: 'application/json' });
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `conversation_${Date.now()}.json`;
      
      // Append to the document, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up the URL object
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting conversation:', error);
    }
  }, [messages]);

  const handleImport = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('http://localhost:3001/import-conversation', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        
        // Update the messages state with the imported conversation
        setMessages(data.conversation);
      } catch (error) {
        console.error('Error importing conversation:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      const scrollHeight = chatContainerRef.current.scrollHeight;
      const height = chatContainerRef.current.clientHeight;
      const maxScrollTop = scrollHeight - height;
      chatContainerRef.current.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
    }
  }, [messages, currentTypingText]);

  useEffect(() => {
    if (isTypingComplete && currentTypingText) {
      setMessages(prevMessages => [...prevMessages, { text: currentTypingText, sender: 'bot' }]);
      setIsLoading(false);
    }
  }, [isTypingComplete, currentTypingText]);

  useEffect(() => {
    let interval;
    if (isResponseLoading) {
      let dots = 0;
      interval = setInterval(() => {
        setThinkingText('Thinking' + '.'.repeat(dots % 4));
        dots++;
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isResponseLoading]);

  const messageElements = useMemo(() => (
    messages.map((message, index) => (
      <div key={index} className={`mb-4 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}>
        <span className={`inline-block p-2 rounded-lg ${message.sender === 'user' ? 'bg-gray-300 text-black' : 'bg-slate-800 text-white'}`}>
          {message.text}
        </span>
      </div>
    ))
  ), [messages]);

  return (
    <div className='flex flex-col h-screen'>
      <Header 
        onExport={handleExport} 
        onImport={handleImport} 
        isResponseLoading={isResponseLoading || isTyping}
      />
      <div className="flex flex-col md:flex-row flex-grow overflow-hidden">
        {/* Left Section */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full bg-slate-900 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl mb-4">
            <img
              src={currentImage}
              alt="AI generated image"
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
        {/* Right Section - Chat UI */}
        <div className="w-full md:w-1/2 bg-slate-900 flex flex-col h-1/2 md:h-full overflow-hidden pt-4 md:pt-0">
          <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4">
            <div className="hidden md:flex justify-center mb-4">
              <div className="max-w-md w-full bg-slate-800 text-white p-4 rounded-lg shadow-md">
                <h2 className="font-bold text-lg mb-2 text-center">Instructions</h2>
                <ul className="list-disc list-inside">
                  <li>Type your message in the input field below.</li>
                  <li>Press Enter or click the send button to send your message.</li>
                  <li>The chatbot will respond to your message with text and voice.</li>
                </ul>
              </div>
            </div>
            {messageElements}
            {isResponseLoading && (
              <div className="mb-4 text-left">
                <span className="inline-block p-2 rounded-lg bg-slate-800 text-white">
                  {thinkingText}
                </span>
              </div>
            )}
            {isTyping && (
              <div className="mb-4 text-left">
                <span className="inline-block p-2 rounded-lg bg-slate-800 text-white">
                  {currentTypingText}
                </span>
              </div>
            )}
          </div>
          
          {/* Input area */}
          <div className="p-4 bg-slate-900 w-full">
            <div className="flex items-center">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`px-4 py-2 rounded-l-lg mr-0 ${
                  isRecording ? 'bg-red-600' : 'bg-slate-600'
                } text-white h-12 flex items-center justify-center`}
                disabled={isLoading}
              >
                <img src={isRecording ? micSvg : stopSvg} alt={isRecording ? "Stop" : "Mic"} className="w-6 h-6" />
              </button>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 border-y p-2 h-12"
                placeholder="Type a message..."
                disabled={isLoading || isRecording}
              />
              <button
                onClick={handleSendMessage}
                className="bg-slate-600 text-white px-4 py-2 rounded-r-lg active:bg-slate-700 disabled:bg-slate-400 h-12 flex items-center justify-center"
                disabled={isLoading || isRecording}
              >
                <img src={rocketSvg} alt="Send" className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <audio ref={audioRef} style={{display: 'none'}} />
    </div>
  );
}

export default React.memo(App);