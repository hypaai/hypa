import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/modules/chat/chat-screen';

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen id={id} />;
}
