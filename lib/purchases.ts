import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

export type { PurchasesPackage };

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

// react-native-purchases est un module natif : il n'existe pas dans Expo Go.
// Sans ce garde, l'app crashe au démarrage pendant le dev UI.
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';

export const purchasesAvailable = !IN_EXPO_GO && !!API_KEY;

type PurchasesModule = typeof import('react-native-purchases').default;

let purchases: PurchasesModule | null = null;
let configured = false;

/** Chargé à la demande : importer le module en haut suffirait à casser Expo Go. */
function load(): PurchasesModule | null {
  if (!purchasesAvailable) return null;
  if (!purchases) purchases = require('react-native-purchases').default as PurchasesModule;
  return purchases;
}

/**
 * Configure le SDK et associe l'utilisateur RevenueCat à l'id Supabase.
 * Ce logIn est ce qui rend `app_user_id` exploitable par revenuecat-webhook :
 * sans lui, les events arrivent avec un id anonyme et sont ignorés.
 */
export async function identify(userId: string): Promise<void> {
  const sdk = load();
  if (!sdk) return;

  if (!configured) {
    sdk.configure({ apiKey: API_KEY!, appUserID: userId });
    configured = true;
    return;
  }
  await sdk.logIn(userId);
}

export async function signOutPurchases(): Promise<void> {
  const sdk = load();
  if (!sdk || !configured) return;
  await sdk.logOut();
}

export async function getOffering(): Promise<PurchasesOffering | null> {
  const sdk = load();
  if (!sdk) return null;
  try {
    const offerings = await sdk.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

export type PurchaseOutcome =
  | { status: 'purchased'; info: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  const sdk = load();
  if (!sdk) return { status: 'error', message: 'Purchases unavailable in this build.' };
  try {
    const { customerInfo } = await sdk.purchasePackage(pkg);
    return { status: 'purchased', info: customerInfo };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return { status: 'cancelled' };
    return { status: 'error', message: err.message ?? 'Purchase failed.' };
  }
}

export async function restore(): Promise<PurchaseOutcome> {
  const sdk = load();
  if (!sdk) return { status: 'error', message: 'Purchases unavailable in this build.' };
  try {
    return { status: 'purchased', info: await sdk.restorePurchases() };
  } catch (e) {
    return { status: 'error', message: (e as Error).message ?? 'Restore failed.' };
  }
}
