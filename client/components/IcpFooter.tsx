import { View, Text, TouchableOpacity, Linking } from 'react-native';

const ICP_NUMBERS = ['粤ICP备2026091192号', '粤ICP备2026091192号-2A'];
const ICP_URL = 'https://beian.miit.gov.cn/';

export default function IcpFooter() {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
      }}
    >
      <TouchableOpacity
        onPress={() => Linking.openURL(ICP_URL)}
        activeOpacity={0.7}
      >
        <Text
          style={{
            fontSize: 11,
            color: '#9CA3AF',
            textAlign: 'center',
          }}
        >
          {ICP_NUMBERS.join(' | ')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}