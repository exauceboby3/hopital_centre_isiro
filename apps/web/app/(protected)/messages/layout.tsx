import styles from './messages-page.module.css';

export default function MessagesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={styles.page}>{children}</div>;
}
