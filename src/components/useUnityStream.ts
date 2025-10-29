import { useEffect, useRef, useState } from "react";

export default function useUnityStream(signalingUrl: string) {
  const unityVideoRef = useRef<HTMLVideoElement | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(signalingUrl);
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    ws.onopen = () => {
      console.log("🛰️ WebSocket connected:", signalingUrl);
      ws.send(JSON.stringify({ type: "connect", connectionId: "react-client" }));
    };

    ws.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);
      console.log("📨 Raw message from signaling:", data);

      if (data.type === "offer" && data.data?.sdp) {
        console.log("📡 Got offer from Unity");
        await pc.setRemoteDescription({ type: "offer", sdp: data.data.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(
          JSON.stringify({
            type: "answer",
            from: "react-client",
            to: data.from,
            data: { sdp: answer.sdp },
          })
        );
        console.log("✅ Sent answer to Unity");
      } else if (data.type === "candidate" && data.data?.candidate) {
        try {
          await pc.addIceCandidate({
            candidate: data.data.candidate,
            sdpMid: String(data.data.sdpMid),
            sdpMLineIndex: Number(data.data.sdpMLineIndex),
          });
          console.log("🧊 Added ICE candidate");
        } catch (err) {
          console.error("❌ Failed to add ICE candidate:", err);
        }
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(
          JSON.stringify({
            type: "candidate",
            from: "react-client",
            data: e.candidate,
          })
        );
      }
    };

    pc.ontrack = (event) => {
      console.log("🎥 Video track received from Unity!");
      if (unityVideoRef.current) {
        unityVideoRef.current.srcObject = event.streams[0];
        unityVideoRef.current.play().catch(console.error);
        setConnected(true);
      }
    };

    return () => {
      ws.close();
      pc.close();
    };
  }, [signalingUrl]);

  return { unityVideoRef, connected };
}
