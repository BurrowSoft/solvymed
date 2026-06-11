import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';
import { useRole } from '@/lib/role-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color }: { name: IoniconName; color: string }) {
  return <Ionicons name={name} size={24} color={color} />;
}

export default function TabLayout() {
  const { role } = useRole();
  const isPatient = role === 'patient';
  // Secretary: hides payments tab (billing is doctor-only in this setup)
  const hidePayments = isPatient;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="home/index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule/index"
        options={{
          title: t('tab.schedule'),
          tabBarIcon: ({ color }) => <TabIcon name="calendar-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="patients/index"
        options={{
          title: t('tab.patients'),
          tabBarIcon: ({ color }) => <TabIcon name="people-outline" color={color} />,
          href: isPatient ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="payments/index"
        options={{
          title: t('tab.payments'),
          tabBarIcon: ({ color }) => <TabIcon name="card-outline" color={color} />,
          href: hidePayments ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: t('tab.settings'),
          tabBarIcon: ({ color }) => <TabIcon name="settings-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
