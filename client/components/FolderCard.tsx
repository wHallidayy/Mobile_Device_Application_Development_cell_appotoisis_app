import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/config';

export type SyncStatus = 'synced' | 'pending' | 'failed';

interface FolderCardProps {
  name: string;
  onPress: () => void;
  onLongPress?: () => void;
  syncStatus?: SyncStatus;
}

const getSyncIcon = (status: SyncStatus) => {
  switch (status) {
    case 'synced':
      return { name: 'cloud-done-outline' as const, color: Colors.syncSuccess };
    case 'pending':
      return { name: 'cloud-upload-outline' as const, color: Colors.syncPending };
    case 'failed':
      return { name: 'cloud-offline-outline' as const, color: Colors.syncFailed };
  }
};

export default function FolderCard({ name, onPress, onLongPress, syncStatus }: FolderCardProps) {
  // สีที่คุณต้องการเมื่อกด
  const pressedColor = '#525251';

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
    >
    {/* เราเปลี่ยนมาใช้ Render Function เพื่อดึงค่า pressed มาใช้กับ view ข้างใน */}
      {({ pressed }) => (
        <>
          <View style={styles.folderIconWrapper}>
            {/* ส่วนหัวของโฟลเดอร์ */}
            <View
              style={[
                styles.folderTab,
                // ถ้าถูกกด ให้ใช้สี pressedColor ถ้าไม่ ให้ใช้สีเดิม (primaryDark)
                { backgroundColor: pressed ? pressedColor : Colors.primaryDark }
              ]}
            />
            {/* ส่วนตัวของโฟลเดอร์ */}
            <View
              style={[
                styles.folderShape,
                 // ถ้าถูกกด ให้ใช้สี pressedColor ถ้าไม่ ให้ใช้สีเดิม (primaryDark)
                { backgroundColor: pressed ? pressedColor : Colors.primaryDark }
              ]}
            >
              {syncStatus && (
                <View style={styles.syncIndicator}>
                  <Ionicons
                    name={getSyncIcon(syncStatus).name}
                    size={16}
                    color={getSyncIcon(syncStatus).color}
                  />
                </View>
              )}
            </View>
            {/* <View style={styles.menuDots}>
              <Text style={styles.menuDotsText}>•••</Text>
            </View> */}
          </View>
          <Text style={styles.folderName} numberOfLines={1}>{name}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    // ลบ containerPressed ที่เคยทำ opacity ทิ้งไป
  },
  folderIconWrapper: {
    position: 'relative',
    marginBottom: 8,
    paddingTop: 8,
  },
  folderTab: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '40%',
    height: 12,
    // เอา backgroundColor ออกจากตรงนี้ เพราะเราย้ายไปใส่ใน style แบบ inline ด้านบนแทน
    // backgroundColor: Colors.primaryDark,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  // ลบ folderTabPressed ที่ไม่ได้ใช้ออก
  folderShape: {
    width: '100%',
    aspectRatio: 4 / 3,
    // เอา backgroundColor ออกจากตรงนี้เช่นกัน
    // backgroundColor: Colors.primaryDark,
    borderRadius: 12,
    borderTopLeftRadius: 4,
  },
  // ลบ folderShapePressed ที่ไม่ได้ใช้ออก
  syncIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  menuDots: {
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  menuDotsText: {
    color: Colors.textPlaceholder,
    fontSize: 14,
    letterSpacing: 2,
  },
  folderName: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
});