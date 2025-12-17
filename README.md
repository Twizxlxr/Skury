# Skury AI - Gemini-Powered Browser Extension

A dark-themed browser extension that provides an AI-powered side panel with a draggable bubble interface, powered by Google's Gemini API.

## Features

- **🎨 Side Panel Interface**: Elegant dark-themed sidebar with Gemini AI integration
- **💬 AI Chat**: Interactive chat interface powered by Google Gemini API
- **📄 Page Reading**: Analyze and summarize web page content
- **🎯 Draggable Bubble**: Convenient floating bubble for quick access
- **🌓 Theme Support**: Dark and light theme options
- **⚡ Quick Actions**: Toolbar with reading and utility functions
- **🔒 Secure**: Content security policy and secure API communication

## Installation

### Prerequisites
- Chrome, Edge, or any Chromium-based browser
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Steps

1. **Clone or Download**
   ```bash
   git clone https://github.com/Twizxlxr/Skury.git
   cd Skury
   ```

2. **Load the Extension**
   - Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode" (toggle in the top right)
   - Click "Load unpacked"
   - Select the `Skury` folder

3. **Configure API Key**
   - Click the Skury extension icon
   - Enter your Gemini API key when prompted
   - The key is stored locally in your browser

## Usage

### Opening Skury

- Click the Skury extension icon in your browser toolbar
- A side panel will appear with the AI chat interface

### Chat with AI

1. Type your message in the input field at the bottom
2. Press Enter or click the send button
3. Gemini AI will respond in the chat window

### Read Current Page

- Click the "Read Page" button in the toolbar
- Skury will analyze the current page content and provide insights

### Draggable Bubble

- The bubble appears on web pages for quick access
- Drag it to reposition anywhere on the page
- Click to open the chat interface

## Project Structure

```
Skury/
├── manifest.json       # Extension configuration
├── background.js       # Service worker for background tasks
├── content.js          # Content script injected into pages
├── content.css         # Styles for content script elements
├── popup.html          # Main popup/sidebar interface
├── popup.js            # Popup logic and event handlers
├── sidebar.js          # Sidebar-specific functionality
├── styles.css          # Main stylesheet
└── icon.png           # Extension icon
```

## Development

### Making Changes

1. Edit the source files as needed
2. Go to `chrome://extensions/`
3. Click the reload icon on the Skury extension card
4. Test your changes

### Key Files

- **manifest.json**: Extension metadata and permissions
- **popup.html/popup.js**: Main UI and chat interface
- **content.js**: Injected script for bubble and page interaction
- **background.js**: Handles API calls and background tasks

## Permissions

This extension requires the following permissions:

- `storage`: Store API key and user preferences
- `tabs`: Access tab information for page reading
- `activeTab`: Interact with the current tab
- `scripting`: Inject content scripts
- `host_permissions`: Communicate with Gemini API

## Configuration

The extension stores configuration in Chrome's local storage:

- **API Key**: Your Gemini API key (required)
- **Theme**: User's theme preference (dark/light)
- **Chat History**: Recent conversations (optional)

## Privacy & Security

- API key is stored locally in your browser only
- No data is sent to third-party servers except Google's Gemini API
- Content security policy prevents unauthorized script execution
- All communication with Gemini API uses HTTPS

## Troubleshooting

### Extension doesn't load
- Ensure you're in Developer mode
- Check the browser console for errors
- Verify all files are present in the folder

### API errors
- Verify your Gemini API key is valid
- Check your API quota limits
- Ensure you have internet connectivity

### Bubble not appearing
- Refresh the page after loading the extension
- Check if the content script is allowed on the current site
- Review browser console for errors

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is provided as-is for personal and educational use.

## Acknowledgments

- Powered by [Google Gemini API](https://ai.google.dev/)
- Built for Chrome/Chromium-based browsers

## Contact

- Repository: [https://github.com/Twizxlxr/Skury](https://github.com/Twizxlxr/Skury)
- Issues: [https://github.com/Twizxlxr/Skury/issues](https://github.com/Twizxlxr/Skury/issues)

---

**Note**: This extension requires a valid Gemini API key to function. Visit [Google AI Studio](https://makersuite.google.com/app/apikey) to obtain your free API key.
