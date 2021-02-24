## Crear una aplicación de video conferencia con WebRTC

A continuación, se irán explicando los pasos a seguir y el procedimiento para poder crear una aplicación de videoconferencias con APIs de WebRTC, un par de librerías y un servidor de señalización personalizado.

El objetivo es crear una aplicación con “salas”, en la cual cada “sala” será el host de una llamada uno a uno.

La aplicación funcionará de la siguiente manera: al comenzar la aplicación se podrá escribir el número de una sala, cualquiera que se desee, y para poder comenzar la comunicación la otra persona tiene que poner el mismo número de sala.

Para comenzar, debemos crear una carpeta en la cual irá nuestro proyecto, a continuación, crearemos otra carpeta a la que llamaremos _public_. Luego, mediante cmd, navegaremos a la carpeta del proyecto, instalaremos las librerías.

```
npm init -y
```

```
npm install -S express@4.15.4 socket.io@2.0.3
```

A continuación, crearemos un documento html dentro de la carpeta _public_, el cual contendrá un elemento en el cual se pueda escribir el número de la “sala” y el espacio para mostrar las transmisiones de vídeo, además de las librerías de **socket.io**.

En primer lugar, crearemos el campo en el cual se puede introducir el número de la sala,

```html
<div id="selectRoom">
    <label>Escribe el número de la sala</label>
    <input type="text" id="roomNumber" />
    <button id="goRoom">Go</button>
</div>
```

el espacio donde se mostrarán las transmisiones de vídeo

```HTML
<div id="consultingRoom" style="display: none;">
    <video id="localVideo" autoplay></video>
    <video id="remoteVideo" autoplay></video>
</div>
```

y las librerías necesarias.
````html
    <script src="/socket.io/socket.io.js"></script>
    <script src="client.js"></script>
````

Después de esto, necesitamos crear un archivo JavaScript para el lado del cliente, en el cual se obtendrán los distintos elementos de la página web. También, crearemos algunas variables globales para almacenar el número de la "sala", las transmisiones de vídeo remotas y locales, y los servidores **TURN/STUN** usados.

Además se creará una función al botón para enviar un mensaje de _join_ o _create_ al servidor socket.io. Para ello vamos a crear un archivo JavaScript llamado _client.js_ en la carpeta _public_.

* Variables para referenciar los elementos de la página web

```JavaScript
var divSelectRoom = document.getElementById("selectRoom");
var divConsultingRoom = document.getElementById("consultingRoom");
var inputRoomNumber = document.getElementById("roomNumber");
var btnGoRoom = document.getElementById("goRoom");
var localVideo = document.getElementById("localVideo");
var remoteVideo = document.getElementById("remoteVideo");
```

* Variables globales

```JavaScript
var roomNumber;
var localStream;
var remoteStream;
var rtcPeerConnection;
```

* Servidor STUN

```JavaScript
var iceServers = {
    'iceServers':[
        {'url':'stun:stun.service.mozilla.com'},
        {'url':'stun:stun.l.google.com:19302'}
    ]
}
var streamConstraints = {audio:true, video:true};
var isCaller;
```

Añadimos una función al pulsar el botón y creamos el espacio donde se creará la conexión con el servidor socket.io que se creará más tarde.

```javascript
var socket = io();

btnGoRoom.onclick = function() {
    if (inputRoomNumber.value === '') {
        alert('Introduzca un número de sala')
    } else {
        roomNumber = inputRoomNumber.value; 
        socket.emit('create or join', roomNumber); 
        divSelectRoom.style = "display:none"; 
        divConsultingRoom = "display:block";
    }
}
```

Una vez se ha enviado el mensaje al servidor, tiene que esperar por la respuesta. Ahora vamos a crear el manejador en el mismo _client.js_.

Cuando el primer participante se une a la llamada, el servidor crea una nueva sala y emite un evento _'joined'_ al usuario. Lo mismo ocurre cuando el segundo usuario se une, el buscador obtiene acceso a los dispositivos multimedia(cámara y micrófono), almacena la transmisión en una variable y muestra el vídeo en la pantalla, un mensaje _'ready'_ es enviado al servidor.

Función cuando el usuario es el que crea la sala.

```javaScript
socket.on('created', function(room){
    navigator.mediaDevices.getUserMedia(streamConstraints).then(function(stream){
        localStream = stream;
        localVideo.src = URL.createObjectURL(stream);
        isCaller = true;

    }).catch(function(err){
        console.log('An error ocurred when accessing media devices');
    });
});
```

Cuando el usuario se une a una sala creada previamente.

```javaScript
socket.on('joined', function(room){
    navigator.mediaDevices.getUserMedia(streamConstraints).then(function(stream){
        localStream = stream;
        localVideo.src = URL.createObjectURL(stream);
        socket.emit('ready',roomNumber);
    }).catch(function(err){
        console.log('An error ocurred when accessing media devices');
    });
});
```

Una vez el servidor recibe el mensaje _'ready'_ avisa al primer participante enviandole el mismo mensaje. A partir de aquí empieza el proceso de intercambio de información conocido como **señalización** por lo cual necesitamos añadir el manejador al _client.js_.

Cuando el primer participante recibe el mensaje _'ready'_, se crea un _RTCPeerConnection object_, define los objetos ``onicecandidate`` y ``onaddstream`` _listeners_ a las funciones ``onIceCandidate`` y ``onAddStream`` respectivamente. Por último añade la tranmsión local al objeto de la comunicación entre extremos. Después de eso, prepara un _Offer_, el cual se almacenará localmente y luego se enviará al servidor mediante la función ``setLocalAndOffer``.

EL servidor le hace llegar la oferta la segundo participante, el cual creara sus propias conexiones entre pares, sus _listeners_, almacenará la _Offer_ y prepará una _Answer_ que también se almacenará localmente y se enviará la servidor mediante ``setLocalAndAnswer``.

El servidor le hará llegar esto al primer participante que lo almacenará. Mientras esto ocurre, ambos participantes estarán intercambiando _ice candidates_ enviando mensajes _'candidate'_ al servidor, el cual se los entrega a los clientes.

A continuación añadarimos codigo al _client.js_ para manejar esto.

En primer lugar debemos definir como actuar cuando el servidor emite un _'ready'_

```javaScript
socket.on('ready', function() {
    if (isCaller) {
        rtcPeerConnection = new RTCPeerConnection(iceServers);
        rtcPeerConnection.onicecandidate = onIceCandidate;
        rtcPeerConnection.onaddstream = onAddStream;
        rtcPeerConnection.addStream(localStream);
        rtcPeerConnection.createOffer(setLocalAndOffer, function(e) { console.log(e) });
    }
});
```

Después, definimos como actúa frente a un _Offer_
```javaScript
socket.on('offer',function(event){
    if(!isCaller){
        rtcPeerConnection = new RTCPeerConnection(iceServers);
         rtcPeerConnection.onicecandidate = onIceCandidate;
         rtcPeerConnection.onaddstream = onAddStream;
         rtcPeerConnection.addStream(localStream);
         rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
         rtcPeerConnection.createAnswer(setLocalAndAnswer,function(e){console.log(e)});
    }
});
```

A continuación definimos también como se actúa al emitir una respuesta por parte del servidor y los _candidate_

```javaScript
socket.on('answer',function(event){
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
});
```

```javaScript
socket.on('candidate', function(event) {
    var candidate = RTCIceCandidate({
        sdpMLineIndex: event.label,
        candidate: event.candidate
    });
    rtcPeerConnection.addIceCandidate(candidate);
});

```

Ahora, queda mostrar el resto de funciones dentro del _client.js_.

Por último, debemos crear un archivo JavaScript que se encargará de manejar el lado del servidor y el manejador del socket.io, el archivo _server.js_ se creará en la carpeta raíz.

Una vez este todo list, desde el cmd y estando en la carpeta raíz usamos:
```
node server.js
```

y en los buscadores accedemos a [aquí](http://localhost:3000/)
