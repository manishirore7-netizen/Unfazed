import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { io } from "socket.io-client";
import axiosInstance from "../../api/axiosInstance";

const SOCKET_SERVER_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api"
).replace(/\/api\/?$/, "");

export default function ChatBox({
  role = "therapist", // "therapist" | "client"
  token,
  clientId,
  recipientName = "Care Team",
}) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isMountedRef = useRef(true);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 1. Initial Load Message History via REST
  useEffect(() => {
    isMountedRef.current = true;

    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        let res;
        if (role === "therapist") {
          res = await axiosInstance.get(`/chat/messages/${clientId}`);
        } else {
          const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
          const response = await fetch(`${apiBase}/chat/portal/${token}/messages`);
          res = { data: await response.json() };
        }

        if (isMountedRef.current && res.data?.success) {
          setMessages(res.data.data || []);
          setTimeout(() => scrollToBottom("auto"), 100);
        }
      } catch (err) {
        if (isMountedRef.current) {
          console.error("Failed to load chat history:", err);
          setError("Unable to load chat messages. Please try again.");
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }

    if ((role === "therapist" && clientId) || (role === "client" && token)) {
      fetchHistory();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [role, clientId, token]);

  // 2. Real-time WebSocket Connection
  useEffect(() => {
    const effectiveToken = role === "therapist" ? token || localStorage.getItem("unfazed_token") : token;

    if (!effectiveToken) return;

    const socket = io(SOCKET_SERVER_URL, {
      auth: {
        token: effectiveToken,
        role,
      },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Join conversation room
      socket.emit("join_conversation", { clientId }, () => {
        // Room joined ack
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.warn("Socket connection warning:", err.message);
      setConnected(false);
    });

    // Listen for live messages broadcast
    socket.on("new_message", (newMsg) => {
      setMessages((prev) => {
        // Deduplicate in case message already added
        if (prev.some((m) => m._id === newMsg._id)) {
          return prev;
        }
        return [...prev, newMsg];
      });
      setTimeout(() => scrollToBottom("smooth"), 50);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, clientId, token]);

  // 3. Send Message Handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const content = inputValue.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);

    try {
      let createdMessage = null;

      if (role === "therapist") {
        const res = await axiosInstance.post(`/chat/messages/${clientId}`, {
          content,
        });
        if (res.data?.success) {
          createdMessage = res.data.data;
        }
      } else {
        const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
        const response = await fetch(`${apiBase}/chat/portal/${token}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = await response.json();
        if (data?.success) {
          createdMessage = data.data;
        } else {
          throw new Error(data.message || "Failed to send message.");
        }
      }

      if (createdMessage) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === createdMessage._id)) return prev;
          return [...prev, createdMessage];
        });
        setInputValue("");
        setTimeout(() => scrollToBottom("smooth"), 50);
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="bg-white border border-[#E9DFD2] rounded-2xl shadow-xs flex flex-col h-[520px] overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:px-6 border-b border-[#EAE2D6] bg-[#FAF8F5] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center font-bold text-sm shrink-0">
            {recipientName?.charAt(0)?.toUpperCase() || "C"}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[#14261D] leading-tight">
              {role === "therapist" ? `Chat with ${recipientName}` : recipientName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-emerald-500 animate-pulse" : "bg-stone-300"
                }`}
              />
              <span className="text-[11px] text-[#697970]">
                {connected ? "Real-time Connected" : "Connecting..."}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#55635B] bg-[#F2EDE4] px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3 text-[#1B3B2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            End-to-End Isolated
          </span>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3.5 bg-[#FCFBF9]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-[#7B8B81]">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1B3B2B] border-t-transparent mr-2" />
            Loading messages...
          </div>
        ) : error && messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-rose-600 mb-2">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#EBF3ED] text-[#1B3B2B] flex items-center justify-center mx-auto">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h4 className="text-xs font-semibold text-[#14261D]">No messages yet</h4>
            <p className="text-[11px] text-[#697970] max-w-xs">
              {role === "therapist"
                ? "Start the conversation with your client. Messages are delivered in real-time."
                : "Send a direct message to your therapist. They will be notified."}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe =
              (role === "therapist" && msg.senderType === "therapist") ||
              (role === "client" && msg.senderType === "client");

            return (
              <div
                key={msg._id || `${msg.createdAt}-${msg.content}`}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div className="text-[10px] text-[#86958C] mb-1 px-1">
                  {isMe ? "You" : msg.senderName || recipientName} •{" "}
                  {formatMessageTime(msg.createdAt)}
                </div>
                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-2xs leading-relaxed break-words ${
                    isMe
                      ? "bg-[#1B3B2B] text-white rounded-br-xs"
                      : "bg-white text-[#14261D] border border-[#E5DDD2] rounded-bl-xs"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 sm:p-4 border-t border-[#EAE2D6] bg-white flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={
            role === "therapist"
              ? "Type a secure message to client..."
              : "Type a message to your therapist..."
          }
          disabled={sending}
          className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-[#D8CEBF] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B3B2B]/20 focus:border-[#1B3B2B] text-[#14261D] transition-all disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || sending}
          className="px-4 py-2.5 rounded-xl bg-[#1B3B2B] hover:bg-[#132A1F] text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {sending ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}

ChatBox.propTypes = {
  role: PropTypes.oneOf(["therapist", "client"]),
  token: PropTypes.string,
  clientId: PropTypes.string,
  recipientName: PropTypes.string,
};
