import React from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';

export default function JitsiCallRoom({ roomName, userName, isVideoCall, onLeave }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <JitsiMeeting
        domain="meet.jit.si"
        roomName={roomName}
        configOverwrite={{
          startWithAudioMuted: false,
          startWithVideoMuted: !isVideoCall,
          prejoinPageEnabled: false,
          disableDeepLinking: true
        }}
        interfaceConfigOverwrite={{
          SHOW_JITSI_WATERMARK: false,
          SHOW_PROMOTIONAL_CLOSE_PAGE: false
        }}
        userInfo={{
          displayName: userName || 'Current User'
        }}
        onApiReady={(externalApi) => {
          // When the user clicks the red "End Call" button in Jitsi, close our component
          externalApi.addListener('videoConferenceLeft', onLeave);
        }}
        getIFrameRef={(iframeRef) => {
          iframeRef.style.height = '100%';
          iframeRef.style.width = '100%';
        }}
      />
    </div>
  );
}
