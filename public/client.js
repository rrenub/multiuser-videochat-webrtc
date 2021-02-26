/**
 * Archivo: server.js
 * Descripción: Script para plataforma de videoconferencia en WebRTC
 * 
 * Autor: Rubén Delgado González
 * Fecha: 26-2-21
 */

// Referencias a elementos del DOM
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')

const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')

// Variables.
const socket = io()
const mediaConstraints = {
  audio: true,
  video: true,
}
const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 1,
};

/**
 * Colección con los objetos RTCPeerConnection.
 * La clave es el ID del socket (de socket.io) del par remoto y el valor es el objeto RTCPeerConnection
 * de dicho par remoto.
 */
var peerConnections = {}; 

let localPeerId; //ID del socket del cliente
let localStream;
let rtcPeerConnection // Connection between the local device and the remote peer.
let roomId; 

// Servidores ICE usados. Solo servidores STUN en este caso.
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

// BUTTON LISTENER ============================================================
connectButton.addEventListener('click', () => {
  joinRoom(roomInput.value)
})

// SOCKET EVENT CALLBACKS =====================================================

/**
 * Mensaje room_created recibido al unirse a una sala vacía
 */
socket.on('room_created', async (event) => {
  localPeerId = event.peerId
  console.log(`Current peer ID: ${localPeerId}`)
  console.log(`Socket event callback: room_created with by peer ${localPeerId}, created room ${event.roomId}`)

  await setLocalStream(mediaConstraints)
})

/**
 * Mensaje room_joined al unirse a una sala con pares conectados. Comienza la llamada enviando
 * start_call
 */
socket.on('room_joined', async (event) => {
  localPeerId = event.peerId
  console.log(`Current peer ID: ${localPeerId}`)
  console.log(`Socket event callback: room_joined by peer ${localPeerId}, joined room ${event.roomId}`)

  await setLocalStream(mediaConstraints)
  console.log(`Emit start_call from peer ${localPeerId}`)
  socket.emit('start_call', {
    roomId: event.roomId,
    senderId: localPeerId
  })
})

/**
 * Mensaje start_call recibido y crea el objeto RTCPeerConnection para enviar la oferta al otro par
 */
socket.on('start_call', async (event) => {
  const remotePeerId = event.senderId;
  console.log(`Socket event callback: start_call. RECEIVED from ${remotePeerId}`)

  peerConnections[remotePeerId] = new RTCPeerConnection(iceServers)
  addLocalTracks(peerConnections[remotePeerId])
  peerConnections[remotePeerId].ontrack = (event) => setRemoteStream(event, remotePeerId)
  peerConnections[remotePeerId].oniceconnectionstatechange = (event) => checkPeerDisconnect(event, remotePeerId);
  peerConnections[remotePeerId].onicecandidate = (event) => sendIceCandidate(event, remotePeerId)
  await createOffer(peerConnections[remotePeerId], remotePeerId)
})

/**
 * Mensaje webrtc_offer recibido con la oferta y envía la respuesta al otro par
 */
socket.on('webrtc_offer', async (event) => {
  console.log(`Socket event callback: webrtc_offer. RECEIVED from ${event.senderId}`)
  const remotePeerId = event.senderId;

  peerConnections[remotePeerId] = new RTCPeerConnection(iceServers)
  console.log(new RTCSessionDescription(event.sdp))
  peerConnections[remotePeerId].setRemoteDescription(new RTCSessionDescription(event.sdp))
  console.log(`Remote description set on peer ${localPeerId} after offer received`)
  addLocalTracks(peerConnections[remotePeerId])

  peerConnections[remotePeerId].ontrack = (event) => setRemoteStream(event, remotePeerId)
  peerConnections[remotePeerId].oniceconnectionstatechange = (event) => checkPeerDisconnect(event, remotePeerId);
  peerConnections[remotePeerId].onicecandidate = (event) => sendIceCandidate(event, remotePeerId)
  await createAnswer(peerConnections[remotePeerId], remotePeerId)
})

/**
 * Mensaje webrtc_answer recibido y termina el proceso offer/answer.
 */
socket.on('webrtc_answer', async (event) => {
  console.log(`Socket event callback: webrtc_answer. RECEIVED from ${event.senderId}`)

  console.log(`Remote description set on peer ${localPeerId} after answer received`)
  peerConnections[event.senderId].setRemoteDescription(new RTCSessionDescription(event.sdp))
  //addLocalTracks(peerConnections[event.senderId])
  console.log(new RTCSessionDescription(event.sdp))
})

/**
 * Mensaje webrtc_ice_candidate. Candidato ICE recibido de otro par
 */
socket.on('webrtc_ice_candidate', (event) => {
  const senderPeerId = event.senderId;
  console.log(`Socket event callback: webrtc_ice_candidate. RECEIVED from ${senderPeerId}`)

  // ICE candidate configuration.
  var candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  })
  peerConnections[senderPeerId].addIceCandidate(candidate)
})

// FUNCTIONS ==================================================================

/**
 * Envía mensaje join al servidor. Servidor responderá con room_joined o room_created
 */
function joinRoom(room) {
  if (room === '') {
    alert('Please type a room ID')
  } else {
    roomId = room
    socket.emit('join', {room: room, peerUUID: localPeerId})
    showVideoConference()
  }
}

/**
 * Cambia el layout para mostrar vídeos al introducir el número de la sala
 */
function showVideoConference() {
  roomSelectionContainer.style = 'display: none'
  videoChatContainer.style = 'display: block'
}

/**
 * Recoge el stream local multimedia usando API getUserMedia
 */
async function setLocalStream(mediaConstraints) {
  console.log('Local stream set')
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
  } catch (error) {
    console.error('Could not get user media', error)
  }

  localStream = stream
  localVideoComponent.srcObject = stream
}

/**
 * Añade un stream multimedia al objeto RTCPeerConnection recibido
 */
function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream)
  })
  console.log("Local tracks added")
}

/**
 * Crea la oferta con la información SDP y la envía con el mensaje webrtc_offer
 */
async function createOffer(rtcPeerConnection, remotePeerId) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createOffer(offerOptions)
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  console.log(`Sending offer from peer ${localPeerId} to peer ${remotePeerId}`)
  socket.emit('webrtc_offer', {
    type: 'webrtc_offer',
    sdp: sessionDescription,
    roomId: roomId,
    senderId: localPeerId,
    receiverId: remotePeerId
  })
}

/**
 * Crea la respuesta con la información SDP y la envía con el mensaje webrtc_answer
 */
async function createAnswer(rtcPeerConnection, remotePeerId) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createAnswer(offerOptions)
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  console.log(`Sending answer from peer ${localPeerId} to peer ${remotePeerId}`)
  socket.emit('webrtc_answer', {
    type: 'webrtc_answer',
    sdp: sessionDescription,
    roomId: roomId,
    senderId: localPeerId,
    receiverId: remotePeerId
  })
}

/**
 * Callback cuando se recibe el stream multimedia del par remoto
 */
function setRemoteStream(event, remotePeerId) {
  console.log('Remote stream set')
  if(event.track.kind == "video") {
    const videoREMOTO = document.createElement('video')
    videoREMOTO.srcObject = event.streams[0];
    videoREMOTO.id = 'remotevideo_' + remotePeerId;
    videoREMOTO.setAttribute('autoplay', '');
    videoREMOTO.style.backgroundColor = "red";
    videoChatContainer.append(videoREMOTO)
  } 
}

/**
 * Envía el candidato ICE recibido del cuando se recibe el evento onicecandidate del objeto RTCPeerConnection
 */
function sendIceCandidate(event, remotePeerId) {
  if (event.candidate) {
    console.log(`Sending ICE Candidate from peer ${localPeerId} to peer ${remotePeerId}`)
    socket.emit('webrtc_ice_candidate', {
      senderId: localPeerId,
      receiverId: remotePeerId,
      roomId: roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    })
  }
}

/**
 * Comprueba si el par se ha desconectado cuando recibe el evento onicestatechange del objeto RTCPeerConnection
 */
function checkPeerDisconnect(event, remotePeerId) {
  var state = peerConnections[remotePeerId].iceConnectionState;
  console.log(`connection with peer ${remotePeerId}: ${state}`);
  if (state === "failed" || state === "closed" || state === "disconnected") {
    //Se eliminar el elemento de vídeo del DOM si se ha desconectado el par
    console.log(`Peer ${remotePeerId} has disconnected`);
    const videoDisconnected = document.getElementById('remotevideo_' + remotePeerId)
    videoDisconnected.remove()
  }
}
