'use client';

import {
  Activity,
  FileText,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { UserAvatar } from '@/components/user-avatar';
import { api, apiUrl } from '@/lib/api';
import { User } from '@/lib/types';

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  sentAt: string;
  readAt?: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}
interface Conversation {
  user: User;
  lastMessage: Message;
  unreadCount: number;
}
const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super-administrateur',
  ADMIN: 'Administrateur',
  CASHIER: 'Caisse',
  RECEPTIONIST: 'Accueil / Réception',
  SECRETARY: 'Accueil / Réception',
  DOCTOR: 'Médecin',
  NURSE: 'Infirmier',
  LAB_TECHNICIAN: 'Technicien de laboratoire',
  MEDICAL_BIOLOGIST: 'Biologiste médical',
  RADIOLOGIST: 'Radiologue',
  SURGEON: 'Chirurgien',
  MIDWIFE: 'Sage-femme',
  PHARMACIST: 'Pharmacien',
  ACCOUNTANT: 'Comptable',
  STOREKEEPER: 'Gestionnaire de stock',
};

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const previousSelectedId = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const [items, availableUsers] = await Promise.all([
        api<Conversation[]>('/messages/conversations'),
        api<User[]>('/users'),
      ]);
      setConversations(items);
      setUsers(availableUsers);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      setMessages(await api<Message[]>(`/messages/conversation/${id}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Conversation impossible.');
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('messages-route-active');
    document.body.classList.add('messages-route-active');
    return () => {
      document.documentElement.classList.remove('messages-route-active');
      document.body.classList.remove('messages-route-active');
    };
  }, []);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selected) return;
    stickToBottom.current = true;
    void loadMessages(selected.id);
    const timer = window.setInterval(() => void loadMessages(selected.id), 5000);
    return () => window.clearInterval(timer);
  }, [selected, loadMessages]);

  useEffect(() => {
    const list = messagesListRef.current;
    if (!list) return;

    const changedConversation = previousSelectedId.current !== selected?.id;
    previousSelectedId.current = selected?.id ?? null;
    if (!changedConversation && !stickToBottom.current) return;

    const frame = window.requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior: changedConversation ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, selected?.id]);

  const trackMessageScroll = () => {
    const list = messagesListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottom.current = distanceFromBottom < 96;
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || (!content.trim() && !selectedFile)) return;
    setSending(true);
    stickToBottom.current = true;
    try {
      if (selectedFile) {
        const data = new FormData();
        data.set('receiverId', selected.id);
        data.set('content', content.trim() || 'Pièce jointe');
        data.set('file', selectedFile);
        await api('/messages/attachment', { method: 'POST', body: data });
      } else {
        await api('/messages', {
          method: 'POST',
          body: JSON.stringify({ receiverId: selected.id, content }),
        });
      }
      setContent('');
      setSelectedFile(null);
      await Promise.all([loadMessages(selected.id), loadConversations()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  const contacts = [
    ...conversations.map((conversation) => conversation.user),
    ...users.filter(
      (availableUser) =>
        !conversations.some((conversation) => conversation.user.id === availableUser.id),
    ),
  ]
    .filter(
      (item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index,
    )
    .filter((contact) =>
      `${contact.username} ${roleLabels[contact.role]}`
        .toLocaleLowerCase('fr')
        .includes(contactQuery.trim().toLocaleLowerCase('fr')),
    );

  return (
    <div className="messages-page-fixed">
      <div className="page-heading messages-page-heading">
        <div>
          <span className="eyebrow">Communication interne</span>
          <h1>Messagerie</h1>
          <p>Échanges sécurisés entre les équipes.</p>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="messaging-panel panel">
        <aside className="contact-list">
          <div className="contact-heading">
            <strong>Conversations</strong>
            <span>{contacts.length} contact(s)</span>
          </div>
          <div className="contact-search search-box">
            <Search size={16} />
            <input
              value={contactQuery}
              onChange={(event) => setContactQuery(event.target.value)}
              placeholder="Nom ou rôle…"
              aria-label="Rechercher un contact"
            />
          </div>
          <div className="contact-scroll">
            {loading ? (
              <div className="empty-state compact">
                <Activity className="spin" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="empty-state compact">
                <UserRoundPlus />
                <span>Aucun contact trouvé.</span>
              </div>
            ) : (
              contacts.map((contact) => {
                const conversation = conversations.find((item) => item.user.id === contact.id);
                return (
                  <button
                    key={contact.id}
                    className={selected?.id === contact.id ? 'contact active' : 'contact'}
                    onClick={() => setSelected(contact)}
                  >
                    <UserAvatar userId={contact.id} username={contact.username} size={36} />
                    <span>
                      <strong>{contact.username}</strong>
                      <small>{conversation?.lastMessage?.content ?? roleLabels[contact.role]}</small>
                    </span>
                    {conversation && conversation.unreadCount > 0 && (
                      <b>{conversation.unreadCount}</b>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>
        <div className="chat-area">
          {!selected ? (
            <div className="empty-state">
              <MessageSquare size={38} />
              <strong>Sélectionnez un contact</strong>
              <span>Commencez ou reprenez une conversation.</span>
            </div>
          ) : (
            <>
              <header className="chat-header">
                <UserAvatar userId={selected.id} username={selected.username} size={42} />
                <div>
                  <strong>{selected.username}</strong>
                  <span>{roleLabels[selected.role]}</span>
                </div>
              </header>
              <div className="messages-list" ref={messagesListRef} onScroll={trackMessageScroll}>
                {messages.length === 0 ? (
                  <div className="empty-state compact">
                    <UserRoundPlus />
                    <span>Commencez la conversation.</span>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={message.senderId === user?.id ? 'bubble sent' : 'bubble received'}
                    >
                      <p>{message.content}</p>
                      {message.attachments?.map((attachment) => (
                        <a
                          className="message-attachment"
                          key={attachment.id}
                          href={apiUrl(`/messages/attachments/${attachment.id}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText size={16} />
                          <span>{attachment.fileName}</span>
                          <small>{Math.ceil(attachment.sizeBytes / 1024)} Ko</small>
                        </a>
                      ))}
                      <span>
                        {new Intl.DateTimeFormat('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(message.sentAt))}
                        {message.senderId === user?.id && (message.readAt ? ' · Lu' : ' · Envoyé')}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <form className="message-form" onSubmit={send}>
                <label className="icon-button" title="Joindre un document ou une image">
                  <Paperclip size={18} />
                  <input
                    className="visually-hidden"
                    type="file"
                    accept="image/*,.pdf,.txt,.csv,.docx,.xlsx"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                {selectedFile && (
                  <span className="selected-message-file">
                    {selectedFile.name}
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      aria-label="Retirer"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
                <input
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Écrire un message…"
                  maxLength={5000}
                />
                <button
                  className="primary-button"
                  disabled={sending || (!content.trim() && !selectedFile)}
                  aria-label="Envoyer"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
