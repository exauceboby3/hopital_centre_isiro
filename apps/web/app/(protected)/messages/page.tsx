'use client';

import {
  Activity,
  Bell,
  Check,
  CheckCheck,
  FileText,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface BusinessNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  entity?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
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

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );

const formatNotificationDate = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

export default function MessagesPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<'messages' | 'notifications'>('messages');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<BusinessNotification[]>([]);
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState('');
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
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      setMessages(await api<Message[]>(`/messages/conversation/${id}`));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Conversation impossible.');
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await api<BusinessNotification[]>('/business-notifications?limit=100'));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Notifications indisponibles.');
    } finally {
      setLoading(false);
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
    if (section === 'messages') {
      void loadConversations();
      const timer = window.setInterval(() => void loadConversations(), 15_000);
      return () => window.clearInterval(timer);
    }
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 15_000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadNotifications, section]);

  useEffect(() => {
    if (!selected || section !== 'messages') return;
    stickToBottom.current = true;
    void loadMessages(selected.id);
    const timer = window.setInterval(() => void loadMessages(selected.id), 15_000);
    return () => window.clearInterval(timer);
  }, [selected, loadMessages, section]);

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

  const deleteMessage = async (message: Message) => {
    setDeletingId(message.id);
    setError('');
    try {
      await api(`/messages/${message.id}`, { method: 'DELETE' });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      await loadConversations();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression impossible.');
    } finally {
      setDeletingId('');
    }
  };

  const openNotification = async (notification: BusinessNotification) => {
    if (!notification.readAt) {
      await api(`/business-notifications/${notification.id}/read`, { method: 'PATCH' });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
    }
    if (notification.actionUrl) window.location.assign(notification.actionUrl);
  };

  const markAllNotificationsRead = async () => {
    await api('/business-notifications/read-all', { method: 'PATCH' });
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
  };

  const contacts = useMemo(
    () =>
      [
        ...conversations.map((conversation) => conversation.user),
        ...users.filter(
          (availableUser) =>
            !conversations.some((conversation) => conversation.user.id === availableUser.id),
        ),
      ]
        .filter(
          (item, index, array) =>
            array.findIndex((candidate) => candidate.id === item.id) === index,
        )
        .filter((contact) =>
          `${contact.username} ${roleLabels[contact.role]}`
            .toLocaleLowerCase('fr')
            .includes(contactQuery.trim().toLocaleLowerCase('fr')),
        ),
    [contactQuery, conversations, users],
  );

  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="messages-page-fixed messaging-v2">
      <div className="page-heading messages-page-heading">
        <div>
          <span className="eyebrow">Communication interne</span>
          <h1>Centre de communication</h1>
          <p>Messages humains et notifications du système sont désormais séparés.</p>
        </div>
        <div className="messaging-section-switch" role="tablist">
          <button
            className={section === 'messages' ? 'active' : ''}
            onClick={() => setSection('messages')}
          >
            <MessageCircle size={17} /> Messages
          </button>
          <button
            className={section === 'notifications' ? 'active' : ''}
            onClick={() => setSection('notifications')}
          >
            <Bell size={17} /> Notifications
            {unreadNotifications > 0 && <b>{unreadNotifications}</b>}
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {section === 'notifications' ? (
        <section className="panel business-notifications-panel">
          <header className="business-notifications-header">
            <div>
              <strong>Notifications métier</strong>
              <span>Laboratoire, hospitalisation, caisse et tâches cliniques</span>
            </div>
            {unreadNotifications > 0 && (
              <button className="secondary-button compact" onClick={() => void markAllNotificationsRead()}>
                <CheckCheck size={16} /> Tout marquer comme lu
              </button>
            )}
          </header>
          <div className="business-notifications-list">
            {loading ? (
              <div className="empty-state">
                <Activity className="spin" /> Chargement…
              </div>
            ) : notifications.length === 0 ? (
              <div className="empty-state">
                <Bell size={36} />
                <strong>Aucune notification métier</strong>
                <span>Les événements du système apparaîtront ici, jamais dans vos conversations.</span>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`business-notification-card${notification.readAt ? '' : ' unread'}`}
                  onClick={() => void openNotification(notification)}
                >
                  <span className="business-notification-icon">
                    {notification.readAt ? <Check size={17} /> : <Bell size={17} />}
                  </span>
                  <span className="business-notification-content">
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <small>{formatNotificationDate(notification.createdAt)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      ) : (
        <section className="messaging-panel panel messaging-panel-v2">
          <aside className="contact-list">
            <div className="contact-heading">
              <div>
                <strong>Conversations</strong>
                <span>{conversations.length} active(s)</span>
              </div>
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
                      <UserAvatar userId={contact.id} username={contact.username} size={40} />
                      <span>
                        <strong>{contact.username}</strong>
                        <small>
                          {conversation?.lastMessage?.content ?? roleLabels[contact.role] ?? contact.role}
                        </small>
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
              <div className="empty-state chat-welcome-state">
                <MessageSquare size={44} />
                <strong>Sélectionnez un collègue</strong>
                <span>Les conversations contiennent uniquement des messages écrits par les utilisateurs.</span>
              </div>
            ) : (
              <>
                <header className="chat-header">
                  <UserAvatar userId={selected.id} username={selected.username} size={44} />
                  <div>
                    <strong>{selected.username}</strong>
                    <span>{roleLabels[selected.role] ?? selected.role}</span>
                  </div>
                </header>

                <div className="messages-list" ref={messagesListRef} onScroll={trackMessageScroll}>
                  {messages.length === 0 ? (
                    <div className="empty-state compact">
                      <MessageSquare />
                      <span>Commencez la conversation.</span>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const sent = message.senderId === user?.id;
                      return (
                        <div key={message.id} className={sent ? 'bubble sent' : 'bubble received'}>
                          <button
                            type="button"
                            className="message-delete-button"
                            disabled={deletingId === message.id}
                            onClick={() => void deleteMessage(message)}
                            title="Retirer ce message de ma conversation"
                            aria-label="Supprimer le message"
                          >
                            {deletingId === message.id ? (
                              <Activity className="spin" size={13} />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
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
                          <span className="message-time">
                            {formatTime(message.sentAt)}
                            {sent && message.readAt && <CheckCheck size={13} aria-label="Lu" />}
                          </span>
                        </div>
                      );
                    })
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
                      <button type="button" onClick={() => setSelectedFile(null)} aria-label="Retirer">
                        <X size={14} />
                      </button>
                    </span>
                  )}
                  <input
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Écrire un message à un collègue…"
                    maxLength={5000}
                  />
                  <button
                    className="primary-button message-send-button"
                    disabled={sending || (!content.trim() && !selectedFile)}
                    aria-label="Envoyer"
                  >
                    {sending ? <Activity className="spin" size={18} /> : <Send size={18} />}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
