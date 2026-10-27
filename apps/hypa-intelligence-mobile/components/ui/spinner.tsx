import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/text'

type SpinnerProps = {
  variant?: 'dots' | 'spinner'
  size?: 'sm' | 'md' | 'lg'
  color?: string
  label?: string
  showLabel?: boolean
}

const SIZE_MAP = {
  sm: 16,
  md: 20,
  lg: 24,
} as const

export function Spinner({
  variant = 'spinner',
  size = 'md',
  color = '#111111',
  label,
  showLabel = false,
}: SpinnerProps) {
  const indicatorSize = SIZE_MAP[size]
  const useDots = variant === 'dots'

  return (
    <View style={styles.container}>
      {useDots ? (
        <View style={styles.dotsRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
      ) : (
        <ActivityIndicator size={indicatorSize} color={color} />
      )}
      {showLabel && label ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 13,
    textAlign: 'center',
  },
})
