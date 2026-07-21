import { View, Text, TouchableOpacity, Linking } from 'react-native';

const ICP_NUMBER = '粤ICP备2026091192号';
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
          }}
        >
          {ICP_NUMBER}
        </Text>
      </TouchableOpacity>
    </View>
  );
}