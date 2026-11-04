import Feather from "@expo/vector-icons/Feather";
import { Redirect, Tabs, useSegments } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { BARBER_COLORS } from "@/components/barber/ui";
import { useBarber } from "@/lib/barber/context";

function Icon({ name, color, size }: { name: React.ComponentProps<typeof Feather>["name"]; color: React.ComponentProps<typeof Feather>["color"]; size: number }) {
  return <Feather name={name} color={color} size={size} />;
}

export default function TabLayout() {
  const { user, authReady } = useBarber();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;
  const isClient = user?.role === "client";
  const isStaff = user?.role === "barber" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const route = segments[segments.length - 1];
  const clientRoute = route === "booking" || route === "history";
  const staffRoute = route === "agenda";
  const adminRoute = route === "clients" || route === "services";

  if (authReady && (!user || (clientRoute && !isClient) || (staffRoute && !isStaff) || (adminRoute && !isAdmin))) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BARBER_COLORS.gold,
        tabBarInactiveTintColor: BARBER_COLORS.textMuted,
        tabBarButton: HapticTab,
        tabBarStyle: {
          display: authReady && user ? "flex" : "none",
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          backgroundColor: BARBER_COLORS.background,
          borderTopColor: BARBER_COLORS.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="booking" options={{ title: "Agendar", href: isClient ? "/booking" : null, tabBarIcon: ({ color, size }) => <Icon name="calendar" color={color} size={size} /> }} />
      <Tabs.Screen name="history" options={{ title: "Histórico", href: isClient ? "/history" : null, tabBarIcon: ({ color, size }) => <Icon name="clock" color={color} size={size} /> }} />
      <Tabs.Screen name="agenda" options={{ title: "Agenda", href: isStaff ? "/agenda" : null, tabBarIcon: ({ color, size }) => <Icon name="calendar" color={color} size={size} /> }} />
      <Tabs.Screen name="clients" options={{ title: "Clientes", href: isAdmin ? "/clients" : null, tabBarIcon: ({ color, size }) => <Icon name="users" color={color} size={size} /> }} />
      <Tabs.Screen name="services" options={{ title: "Serviços", href: isAdmin ? "/services" : null, tabBarIcon: ({ color, size }) => <Icon name="scissors" color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: "Mais", href: user ? "/more" : null, tabBarIcon: ({ color, size }) => <Icon name="menu" color={color} size={size} /> }} />
    </Tabs>
  );
}
