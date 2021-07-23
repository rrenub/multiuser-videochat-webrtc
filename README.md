# Really simple N:N videoconferencing using WebRTC

 Multi-user videoconference prototype using WebRTC and plain JS and HTML. For signalling, it uses Node.js and all multimedia streams are sent directly between users (P2P) after signalling process is finished.
 
## Signalling
 
The signalling process was made based on [this amazing article of Borja Nebbal](https://acidtango.com/thelemoncrunch/how-to-implement-a-video-conference-with-webrtc-and-node/) and adapted for N:N communications. The messages used in this signalling process are shown in the picture below.

<p align="center">
 <img src="https://i.imgur.com/2cKtNtO.png" width="600" height="auto">
</p>

## Usage

Just enter the code of your videoconference room and share that code, so others can join to the same room.
