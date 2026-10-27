import React, { useCallback, useState } from 'react'
import { View, FlatList, TouchableOpacity, StyleSheet, Text } from 'react-native'
import Body from '@/components/shared/body'
import { TopBar } from '@/components/shared/top-bar'
import { Clock, Bookmark, Trash2 } from 'lucide-react-native'
import { useRouter } from 'expo-router'

const MOCK_HISTORY = [
  { id: 'h1', word: 'Able', language: 'English', created_at: new Date().toISOString(), preview: 'Having the power to do something.' },
  { id: 'h2', word: 'Brave', language: 'English', created_at: new Date().toISOString(), preview: 'Showing courage.' },
]

const MOCK_BOOKMARKS = [
  { id: 'b1', word: 'Serendipity', language: 'English', timestamp: Date.now(), preview: 'The occurrence of events by chance in a beneficial way.' },
]

export default function HistoryScreen() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'history' | 'bookmark'>('history')
  const [history, setHistory] = useState(MOCK_HISTORY)
  const [bookmarks, setBookmarks] = useState(MOCK_BOOKMARKS)

  const currentData = activeTab === 'history' ? history : bookmarks

  const handleDelete = useCallback((id: string) => {
    if (activeTab === 'history') setHistory((s) => s.filter((i) => i.id !== id))
    else setBookmarks((s) => s.filter((i) => i.id !== id))
  }, [activeTab])

  const handlePress = useCallback((item: any) => {
    router.push({ pathname: '/word/[word]', params: { word: item.word, lang: item.language } })
  }, [router])

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={s.card} onPress={() => handlePress(item)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={s.word}>{item.word}</Text>
        <Text style={s.lang}>{item.language}</Text>
        <Text style={s.preview} numberOfLines={2}>{item.preview}</Text>
      </View>

      <TouchableOpacity onPress={() => handleDelete(item.id)} style={s.delBtn}>
        <Trash2 size={16} color="#c00" />
      </TouchableOpacity>
    </TouchableOpacity>
  )

  return (
    <Body>
      <TopBar title="Hypa Dictionary" showBack />

      <View style={s.toggleContainer}>
        <TouchableOpacity style={[s.toggleBtn, activeTab === 'history' && s.toggleActive]} onPress={() => setActiveTab('history')}>
          <Clock size={16} color={activeTab === 'history' ? '#fff' : '#666'} />
          <Text style={[s.toggleText, activeTab === 'history' && { color: '#fff' }]}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.toggleBtn, activeTab === 'bookmark' && s.toggleActive]} onPress={() => setActiveTab('bookmark')}>
          <Bookmark size={16} color={activeTab === 'bookmark' ? '#fff' : '#666'} />
          <Text style={[s.toggleText, activeTab === 'bookmark' && { color: '#fff' }]}>Bookmarks</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={currentData} keyExtractor={(i) => i.id} renderItem={renderItem} contentContainerStyle={{ padding: 16, gap: 10 }} />
    </Body>
  )
}

const s = StyleSheet.create({
  toggleContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  toggleBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  toggleActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  toggleText: { marginLeft: 6, color: '#666' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 10 },
  word: { fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  lang: { fontSize: 12, color: '#666', marginTop: 4 },
  preview: { fontSize: 13, color: '#666', marginTop: 8 },
  delBtn: { padding: 8, marginLeft: 8 },
})
