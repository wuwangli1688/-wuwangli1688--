import { Platform, View, Text, TouchableOpacity, Linking } from 'react-native';

const ICP_NUMBER = '粤ICP备2026091192号';
const ICP_URL = 'https://beian.miit.gov.cn/';

export default function IcpFooter() {
  if (Platform.OS !== 'web') return null;

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
      }}
    >
      <TouchableOpacity
        onPress={() => Linking.openURL(ICP_URL)}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontSize: 12,
            color: '#9CA3AF',
          }}
        >
          {ICP_NUMBER}
        </Text>
      </TouchableOpacity>
    </View>
  );
}