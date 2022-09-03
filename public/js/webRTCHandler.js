import * as wss from './wss.js'
import * as constants from './constants.js'
import * as ui from './ui.js'
import * as store from './store.js'

let connectedUserDetails
let peerConnection

const defaultsConstraints = {
  audio: true,
  video: true
}
const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:13902'
    }
  ]
}

export const getLocalPreview = () => {
  navigator.mediaDevices
    .getUserMedia(defaultsConstraints)
    .then((stream) => {
      ui.updateLocalVideo(stream)
      store.setLocalStream(stream)
    })
    .catch((err) => {
      console.error('error occured when trying to get an access to camera')
      console.error(err)
    })
}

// crea la conexion remota
const createPeerConnection = () => {
  peerConnection = new RTCPeerConnection(configuration)
  peerConnection.onicecandidate = (event) => {
    console.log('getting ice candidates from stun server')
    debugger
    if (event.candidate) {
      debugger
      //send our ice candidates to other peer
      wss.sendDataUsingWebRTCSignaling({
        connectedUserDetails: connectedUserDetails.socketId,
        type: constants.webRTCSignaling.ICE_CANDIDATE,
        candidate: event.candidate
      })
      // wss.sendIceCandidate({
      //   connectedUserSocketId: connectedUserDetails.socketId,
      //   type: constants.webRTCSignaling.ICE_CANDIDATE,
      //   candidate: event.candidate
      // })
      // wss.sendIceCandidate(event.candidate)
      // send our ice candidates to other peer
    }
  }

  // se produce cuando se pudo conectar con el par
  peerConnection.onconnectionstatechange = (event) => {
    if (peerConnection.connectionState === 'connected') {
      console.log('succesfully connection with other peer')
    }
  }

  // receiving tracks
  const remoteStream = new MediaStream()
  store.setRemoteStream(remoteStream)
  debugger
  ui.updateRemoteVideo(remoteStream)

  peerConnection.ontrack = (event) => {
    remoteStream.addTrack(event.track)
  }

  // add our stream to peer connection
  if (
    connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE
  ) {
    const localStream = store.getState().localStream
    for (const track of localStream.getTracks()) {
      peerConnection.addTrack(track, localStream)
    }
  }
}

export const sendPreOffer = (callType, calleePersonalCode) => {
  connectedUserDetails = {
    callType,
    socketId: calleePersonalCode
  }

  if (
    callType === constants.callType.CHAT_PERSONAL_CODE ||
    callType === constants.callType.VIDEO_PERSONAL_CODE
  ) {
    const data = {
      callType,
      calleePersonalCode
    }
    ui.showCallingDialog(callingDialogRejectCallHandler)
    wss.sendPreOffer(data)
  }
}

export const handlePreOffer = (data) => {
  const { callType, callerSocketId } = data

  connectedUserDetails = {
    socketId: callerSocketId,
    callType
  }

  if (
    callType === constants.callType.CHAT_PERSONAL_CODE ||
    callType === constants.callType.VIDEO_PERSONAL_CODE
  ) {
    console.log('showing call dialog')
    ui.showIncomingCallDialog(callType, acceptCallHandler, rejectCallHandler)
  }
}

const acceptCallHandler = () => {
  console.log('call accepted')
  debugger
  createPeerConnection()
  sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED)
  ui.showCallElements(connectedUserDetails.callType)
}

const rejectCallHandler = () => {
  console.log('call rejected')
  sendPreOfferAnswer()
  sendPreOfferAnswer(constants.preOfferAnswer.CALL_REJECTED)
}

const callingDialogRejectCallHandler = () => {
  console.log('rejecting the call')
}

const sendPreOfferAnswer = (preOfferAnswer) => {
  const data = {
    callerSocketId: connectedUserDetails.socketId,
    preOfferAnswer
  }
  ui.removeAllDialogs()
  wss.sendPreOfferAnswer(data)
}

export const handlePreOfferAnswer = (data) => {
  const { preOfferAnswer } = data

  ui.removeAllDialogs()

  if (preOfferAnswer === constants.preOfferAnswer.CALLEE_NOT_FOUND) {
    ui.showInfoDialog(preOfferAnswer)
    // show dialog that callee has not been found
  }

  if (preOfferAnswer === constants.preOfferAnswer.CALL_UNAVAILABLE) {
    ui.showInfoDialog(preOfferAnswer)
    // show dialog that callee is not able to connect
  }

  if (preOfferAnswer === constants.preOfferAnswer.CALL_REJECTED) {
    ui.showInfoDialog(preOfferAnswer)
    // show dialog that call is rejected by the callee
  }

  if (preOfferAnswer === constants.preOfferAnswer.CALL_ACCEPTED) {
    ui.showCallElements(connectedUserDetails.callType)
    createPeerConnection()
    // send webRTC offer
    sendWebRTCOffer()
  }
}

const sendWebRTCOffer = async () => {
  const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offer)
  wss.sendDataUsingWebRTCSignaling({
    connectedUserSocketId: connectedUserDetails.socketId,
    type: constants.webRTCSignaling.OFFER,
    offer
  })
}

export const handleWebRTCOffer = async (data) => {
  console.log('webRTC offer came')
  console.log(data)

  // debugger
  await peerConnection.setRemoteDescription(data.offer)
  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(answer)
  wss.sendDataUsingWebRTCSignaling({
    connectedUserSocketId: connectedUserDetails.socketId,
    type: constants.webRTCSignaling.ANSWER,
    answer
  })
  debugger
  // const { offer } = data
  // peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
  // const answer = peerConnection.createAnswer()
  // peerConnection.setLocalDescription(answer)
  // wss.sendWebRTCAnswer(answer)
}

export const handleWebRTCAnswer = async (data) => {
  console.log('handling webRTC answer')
  await peerConnection.setRemoteDescription(data.answer)
}

export const handleWebRTCIceCandidate = async (data) => {
  console.log('handling webRTC ice candidates')
  console.log(data)
  try {
    await peerConnection.addIceCandidate(data.candidate)
  } catch (err) {
    console.error(
      'error occured when trying to received add ice candidate',
      err
    )
  }
}
