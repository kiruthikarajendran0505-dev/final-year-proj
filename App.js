// =================================================================
// ROADSENSE AI - COMPLETE VERSION WITH SMART DETECTION
// ✅ Adaptive Baseline Calibration (60 seconds)
// ✅ Vehicle Type Selector
// ✅ Smart Pothole Detection Threshold
// ✅ Recalibrate button in Profile
// ✅ Forgot Password + Email Verification
// ✅ User Profile + Leaderboard
// ✅ Push Notifications (nearby rough roads)
// ✅ All users see confirmed rough roads
// ✅ Light/Dark mode
// ✅ Google Maps Navigation
// ✅ Google + GitHub Sign-In
// =================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ImageBackground, TextInput, TouchableOpacity,
  Platform, Image, Animated, StatusBar, ScrollView, Modal,
  Keyboard, TouchableWithoutFeedback, Alert, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// FIREBASE IMPORTS
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, getReactNativePersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification,
  GoogleAuthProvider, GithubAuthProvider, signInWithCredential
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, doc, setDoc, getDoc,
  getDocs, updateDoc, query, where, orderBy, serverTimestamp,
  onSnapshot, writeBatch, limit
} from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// =================================================================
// CONFIGURATION
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAuNp-gJAclHS6s0WJfVwtEJQADQwr0D60",
  authDomain: "road-sense2.firebaseapp.com",
  databaseURL: "https://road-sense2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "road-sense2",
  storageBucket: "road-sense2.firebasestorage.app",
  messagingSenderId: "883763025527",
  appId: "1:883763025527:web:b908100f6bf489bed9d872"
};

const GOOGLE_WEB_CLIENT_ID = "883763025527-gqrarm6k6aiebunl64ungktlsvfaun2j.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_ID = "883763025527-gqrarm6k6aiebunl64ungktlsvfaun2j.apps.googleusercontent.com";
const GITHUB_CLIENT_ID = "Ov23liL9tZFehEdyegPP";
const GITHUB_CLIENT_SECRET = "66a382712020487e8b9931d5da3d61cb48cdb6c2";
const GOOGLE_MAPS_API_KEY = "AIzaSyATeJx7qeJL9h5lGaoqADeXRhms_ij_XzI";
const CONFIRMATION_THRESHOLD = 2;
const NEARBY_ALERT_RADIUS = 500;
const NOTIFICATION_COOLDOWN = 300000; // 5 minutes
const CALIBRATION_DURATION = 60; // seconds

// VEHICLE TYPES with offsets above baseline
const VEHICLES = [
  { id: 'bicycle',    label: 'Bicycle',    icon: '🚲', offset: 0.3, description: 'No suspension, very sensitive' },
  { id: 'scooter',    label: 'Scooter',    icon: '🛵', offset: 0.5, description: 'Light suspension' },
  { id: 'motorcycle', label: 'Motorcycle', icon: '🏍️', offset: 0.7, description: 'Medium suspension' },
  { id: 'car',        label: 'Car',        icon: '🚗', offset: 0.9, description: 'Good suspension' },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true,
  }),
});

WebBrowser.maybeCompleteAuthSession();
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) });
const db = getFirestore(app);

// =================================================================
// THEMES
// =================================================================
const THEMES = {
  dark: {
    background: '#09090b', card: '#18181b', card2: '#1a1a1a', card3: '#27272a',
    border: '#333', text: '#ffffff', textSecondary: '#aaaaaa', textMuted: '#666666',
    accent: '#00f3ff', danger: '#ff0000', statusBar: 'light-content',
    overlay: 'rgba(0,0,0,0.8)', modalBg: '#18181b',
  },
  light: {
    background: '#f4f4f5', card: '#ffffff', card2: '#f4f4f5', card3: '#e4e4e7',
    border: '#d4d4d8', text: '#09090b', textSecondary: '#52525b', textMuted: '#a1a1aa',
    accent: '#0072ff', danger: '#dc2626', statusBar: 'dark-content',
    overlay: 'rgba(255,255,255,0.9)', modalBg: '#ffffff',
  }
};

// =================================================================
// AI CLUSTERING
// =================================================================
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const clusterPotholesIntoRoads = (potholes) => {
  if (!potholes.length) return [];
  const CLUSTER_DISTANCE = 150;
  const clusters = [], visited = new Set();
  potholes.forEach((pothole, i) => {
    if (visited.has(i)) return;
    const cluster = [pothole]; visited.add(i);
    potholes.forEach((other, j) => {
      if (visited.has(j)) return;
      if (calculateDistance(pothole.location.latitude, pothole.location.longitude, other.location.latitude, other.location.longitude) <= CLUSTER_DISTANCE) {
        cluster.push(other); visited.add(j);
      }
    });
    if (cluster.length >= 2) clusters.push(cluster);
  });
  return clusters.map((cluster, index) => {
    const sorted = cluster.sort((a, b) => a.location.latitude - b.location.latitude);
    const totalPotholes = cluster.length;
    const highSeverity = cluster.filter(p => p.severity === 'high').length;
    const avgForce = cluster.reduce((s, p) => s + p.force, 0) / totalPotholes;
    const uniqueUsers = new Set(cluster.map(p => p.userId)).size;
    let roadStatus = 'moderate';
    if (highSeverity >= 3 || avgForce >= 1.8 || totalPotholes >= 5) roadStatus = 'rough';
    if (cluster.every(p => p.status === 'fixed')) roadStatus = 'smooth';
    return {
      id: `road_${index}_${Date.now()}`,
      coordinates: sorted.map(p => ({ latitude: p.location.latitude, longitude: p.location.longitude })),
      potholes: cluster.map(p => p.id),
      status: roadStatus, totalPotholes, highSeverityCount: highSeverity,
      averageForce: avgForce, estimatedLength: calculateRoadLength(sorted),
      uniqueUsers, isConfirmed: uniqueUsers >= CONFIRMATION_THRESHOLD,
    };
  });
};

const calculateRoadLength = (potholes) => {
  if (potholes.length < 2) return 0;
  let d = 0;
  for (let i = 0; i < potholes.length - 1; i++)
    d += calculateDistance(potholes[i].location.latitude, potholes[i].location.longitude, potholes[i+1].location.latitude, potholes[i+1].location.longitude);
  return d;
};

// =================================================================
// MAIN APP
// =================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('user');
  const [userProfile, setUserProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // THEME
  const [isDarkMode, setIsDarkMode] = useState(true);
  const theme = isDarkMode ? THEMES.dark : THEMES.light;

  // SCREENS
  const [currentScreen, setCurrentScreen] = useState('map');
  const [appScreen, setAppScreen] = useState('login'); // login | vehicleSelect | calibration | dashboard

  // VEHICLE & CALIBRATION
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationSeconds, setCalibrationSeconds] = useState(CALIBRATION_DURATION);
  const [calibrationReadings, setCalibrationReadings] = useState([]);
  const [baselineThreshold, setBaselineThreshold] = useState(1.3); // default fallback
  const calibrationAnim = useRef(new Animated.Value(1)).current;
  const calibrationTimerRef = useRef(null);
  const calibrationReadingsRef = useRef([]);

  // MODALS
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // LOCATION & SENSOR
  const [location, setLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [status, setStatus] = useState("ACTIVE");
  const [logs, setLogs] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // MAP
  const [myPotholes, setMyPotholes] = useState([]);
  const [roadSegments, setRoadSegments] = useState([]);
  const [confirmedRoads, setConfirmedRoads] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedPothole, setSelectedPothole] = useState(null);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [showRoads, setShowRoads] = useState(true);
  const mapRef = useRef(null);

  // NAVIGATION
  const [destinationInput, setDestinationInput] = useState('');
  const [navigationActive, setNavigationActive] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);

  // NOTIFICATIONS
  const [notifiedRoads, setNotifiedRoads] = useState(new Set());

  // GOVERNMENT & ADMIN
  const [filterStatus, setFilterStatus] = useState('all');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0, totalPotholes: 0, fixedPotholes: 0,
    activeUsers: 0, roughRoadsKm: 0, smoothRoadsKm: 0, totalRoadsKm: 0
  });

  // ANIMATIONS
  const shineAnim = useRef(new Animated.Value(0)).current;
  const socialShineAnim = useRef(new Animated.Value(0)).current;
  const buttonShineAnim = useRef(new Animated.Value(0)).current;
  const loginTitleAnim = useRef(new Animated.Value(0)).current;

  // =================================================================
  // LOAD SAVED SETTINGS
  // =================================================================
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('isDarkMode');
        if (savedTheme !== null) setIsDarkMode(JSON.parse(savedTheme));
        const savedVehicle = await AsyncStorage.getItem('vehicleType');
        const savedBaseline = await AsyncStorage.getItem('baselineThreshold');
        if (savedVehicle) setSelectedVehicle(JSON.parse(savedVehicle));
        if (savedBaseline) setBaselineThreshold(parseFloat(savedBaseline));
      } catch (e) {}
    };
    loadSettings();
    registerForPushNotifications();
  }, []);

  const toggleTheme = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    await AsyncStorage.setItem('isDarkMode', JSON.stringify(newMode));
  };

  // =================================================================
  // PUSH NOTIFICATIONS
  // =================================================================
  const registerForPushNotifications = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (existingStatus !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    } catch (e) { console.log('Notification setup error:', e); }
  };

  useEffect(() => {
    if (!location || !confirmedRoads.length) return;
    confirmedRoads.forEach(road => {
      if (notifiedRoads.has(road.id)) return;
      const nearbyCoord = road.coordinates.find(coord =>
        calculateDistance(location.latitude, location.longitude, coord.latitude, coord.longitude) <= NEARBY_ALERT_RADIUS
      );
      if (nearbyCoord) {
        sendNearbyRoadNotification(road);
        setNotifiedRoads(prev => new Set([...prev, road.id]));
        setTimeout(() => {
          setNotifiedRoads(prev => {
            const next = new Set(prev);
            next.delete(road.id);
            return next;
          });
        }, NOTIFICATION_COOLDOWN);
      }
    });
  }, [location, confirmedRoads]);

  const sendNearbyRoadNotification = async (road) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "⚠️ Rough Road Ahead!",
        body: `Confirmed rough road within ${NEARBY_ALERT_RADIUS}m. Drive carefully!`,
        data: { roadId: road.id }, sound: true,
      },
      trigger: null,
    });
  };

  // =================================================================
  // GOOGLE SIGN-IN
  // =================================================================
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const credential = GoogleAuthProvider.credential(response.params.id_token);
      setIsLoading(true);
      signInWithCredential(auth, credential)
        .then(uc => { setUser(uc.user); handlePostLogin(uc.user); Alert.alert("Success!", "Logged in with Google!"); })
        .catch(e => Alert.alert("Google Error", e.message))
        .finally(() => setIsLoading(false));
    }
  }, [response]);

  // =================================================================
  // GITHUB SIGN-IN
  // =================================================================
  const [githubRequest, githubResponse, githubPromptAsync] = useAuthRequest(
    { clientId: GITHUB_CLIENT_ID, scopes: ['identity', 'user:email'], redirectUri: makeRedirectUri({ useProxy: true }) },
    { authorizationEndpoint: 'https://github.com/login/oauth/authorize' }
  );

  useEffect(() => {
    if (githubResponse?.type === 'success') handleGithubAuth(githubResponse.params.code);
  }, [githubResponse]);

  const handleGithubAuth = async (code) => {
    setIsLoading(true);
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
      });
      const tokenData = await res.json();
      const credential = GithubAuthProvider.credential(tokenData.access_token);
      const uc = await signInWithCredential(auth, credential);
      setUser(uc.user);
      await handlePostLogin(uc.user);
      Alert.alert("Success!", "Logged in with GitHub!");
    } catch (e) { Alert.alert("GitHub Error", e.message); }
    finally { setIsLoading(false); }
  };

  // =================================================================
  // ANIMATIONS
  // =================================================================
  useEffect(() => {
    const loopAnim = (anim, dur) => Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: dur, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 0, duration: dur, useNativeDriver: false }),
    ]));
    const anims = [loopAnim(shineAnim, 2000), loopAnim(socialShineAnim, 2500), loopAnim(buttonShineAnim, 3000), loopAnim(loginTitleAnim, 3500)];
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  // =================================================================
  // POST LOGIN FLOW
  // =================================================================
  const handlePostLogin = async (loggedInUser) => {
    await createUserProfile(loggedInUser.uid, loggedInUser.email);
    loadUserRole(loggedInUser);
    requestLocationPermission();
    loadLeaderboard();
    // Check if vehicle already selected
    const savedVehicle = await AsyncStorage.getItem('vehicleType');
    if (savedVehicle) {
      setAppScreen('dashboard');
    } else {
      setAppScreen('vehicleSelect');
    }
  };

  useEffect(() => {
    if (!user || !locationPermission) return;
    const sub = Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      loc => setLocation(loc.coords)
    );
    return () => { sub.then(s => s.remove()); };
  }, [user, locationPermission]);

  useEffect(() => {
    if (!user || userRole !== 'user' || appScreen !== 'dashboard') return;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(d => {
      setData(d);
      if (isCalibrating) {
        calibrationReadingsRef.current.push(Math.abs(d.z));
        return;
      }
      if (Math.abs(d.z) > baselineThreshold && !isSending && location) {
        uploadPothole(d);
      }
    });
    return () => sub?.remove();
  }, [user, userRole, isSending, location, baselineThreshold, isCalibrating, appScreen]);

  useEffect(() => {
    if (!user) return;
    const allQ = query(collection(db, 'potholes'), orderBy('timestamp', 'desc'));
    const unsubAll = onSnapshot(allQ, snap => {
      const allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const segs = clusterPotholesIntoRoads(allData);
      setRoadSegments(segs);
      setConfirmedRoads(segs.filter(r => r.isConfirmed));
    });
    const myQ = query(collection(db, 'potholes'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    const unsubMy = onSnapshot(myQ, snap => setMyPotholes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubAll(); unsubMy(); };
  }, [user]);

  useEffect(() => { if (userRole === 'admin') loadAdminStats(); }, [userRole, roadSegments]);

  // =================================================================
  // AUTH FUNCTIONS
  // =================================================================
  const loadUserRole = async (loggedInUser) => {
    try {
      const u = loggedInUser || user;
      if (!u) return;
      const snap = await getDoc(doc(db, 'users', u.uid));
      if (snap.exists()) {
        setUserRole(snap.data().role || 'user');
        setUserProfile(snap.data());
      }
    } catch (e) { console.error(e); }
  };

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setLocationPermission(true);
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    } else Alert.alert("Location Required", "Please enable location!");
  };

  const createUserProfile = async (uid, userEmail) => {
    try {
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { email: userEmail, role: 'user', createdAt: serverTimestamp(), totalReports: 0, contributionScore: 0 });
        setUserRole('user');
        setUserProfile({ email: userEmail, role: 'user', totalReports: 0, contributionScore: 0 });
      } else {
        setUserRole(snap.data().role || 'user');
        setUserProfile(snap.data());
      }
    } catch (e) { console.error(e); }
  };

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Enter email & password");
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        setUser(cred.user);
        setShowVerifyEmail(true);
        return;
      }
      setUser(cred.user);
      await handlePostLogin(cred.user);
    } catch (e) { Alert.alert("Login Failed", e.message); }
    finally { setIsLoading(false); }
  };

  const handleSignUp = async () => {
    if (!email || !password) return Alert.alert("Error", "Enter email & password");
    if (password.length < 6) return Alert.alert("Error", "Password must be 6+ characters");
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      setUser(cred.user);
      await createUserProfile(cred.user.uid, cred.user.email);
      setShowVerifyEmail(true);
    } catch (e) { Alert.alert("Sign Up Failed", e.message); }
    finally { setIsLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) return Alert.alert("Error", "Please enter your email");
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim());
      Alert.alert("Email Sent! 📧", `Reset link sent to ${forgotEmail}!`,
        [{ text: "OK", onPress: () => { setShowForgotPassword(false); setForgotEmail(''); } }]
      );
    } catch (e) { Alert.alert("Error", e.message); }
    finally { setIsLoading(false); }
  };

  const resendVerificationEmail = async () => {
    try {
      await sendEmailVerification(user);
      Alert.alert("Sent!", "Verification email resent!");
    } catch (e) { Alert.alert("Error", e.message); }
  };

  const checkEmailVerified = async () => {
    try {
      await user.reload();
      if (user.emailVerified) {
        setShowVerifyEmail(false);
        await handlePostLogin(user);
        Alert.alert("Verified! ✅", "Welcome to RoadSense!");
      } else {
        Alert.alert("Not Verified Yet", "Please check your inbox.");
      }
    } catch (e) { Alert.alert("Error", e.message); }
  };

  const handleLogout = async () => {
    setUser(null); setEmail(''); setPassword('');
    setNavigationActive(false); setDestinationCoords(null);
    setCurrentScreen('map'); setUserProfile(null);
    setAppScreen('login');
  };

  // =================================================================
  // VEHICLE SELECTION
  // =================================================================
  const handleVehicleSelect = async (vehicle) => {
    setSelectedVehicle(vehicle);
    await AsyncStorage.setItem('vehicleType', JSON.stringify(vehicle));
    setAppScreen('calibration');
    startCalibration(vehicle);
  };

  // =================================================================
  // CALIBRATION
  // =================================================================
  const startCalibration = (vehicle) => {
    setIsCalibrating(true);
    setCalibrationSeconds(CALIBRATION_DURATION);
    calibrationReadingsRef.current = [];

    // Animate the circle
    Animated.loop(
      Animated.sequence([
        Animated.timing(calibrationAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(calibrationAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Countdown timer
    let secondsLeft = CALIBRATION_DURATION;
    calibrationTimerRef.current = setInterval(() => {
      secondsLeft -= 1;
      setCalibrationSeconds(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(calibrationTimerRef.current);
        finishCalibration(vehicle);
      }
    }, 1000);
  };

  const finishCalibration = async (vehicle) => {
    setIsCalibrating(false);
    const readings = calibrationReadingsRef.current;
    let baseline = 1.0; // fallback
    if (readings.length > 0) {
      const avg = readings.reduce((s, r) => s + r, 0) / readings.length;
      baseline = avg;
    }
    const vehicleData = vehicle || selectedVehicle;
    const threshold = baseline + vehicleData.offset;
    setBaselineThreshold(threshold);
    await AsyncStorage.setItem('baselineThreshold', threshold.toString());
    Alert.alert(
      "Calibration Complete! 🎉",
      `Baseline: ${baseline.toFixed(2)}g\nVehicle offset: +${vehicleData.offset}g\nDetection threshold: ${threshold.toFixed(2)}g\n\nRoadSense is now optimized for your ${vehicleData.label}!`,
      [{ text: "Let's Go! 🚀", onPress: () => setAppScreen('dashboard') }]
    );
  };

  const handleRecalibrate = () => {
    Alert.alert(
      "Recalibrate?",
      "This will reset your detection threshold. Drive on a smooth road during calibration.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Recalibrate",
          onPress: async () => {
            await AsyncStorage.removeItem('vehicleType');
            await AsyncStorage.removeItem('baselineThreshold');
            setSelectedVehicle(null);
            setBaselineThreshold(1.3);
            setAppScreen('vehicleSelect');
          }
        }
      ]
    );
  };

  // =================================================================
  // POTHOLE UPLOAD
  // =================================================================
  const uploadPothole = async (sensorData) => {
    if (!location) return;
    setIsSending(true); setStatus("TRANSMITTING...");
    const newLog = { id: Date.now(), time: new Date().toLocaleTimeString(), status: "SENDING..." };
    setLogs(prev => [newLog, ...prev]);
    try {
      await addDoc(collection(db, 'potholes'), {
        userId: user.uid, userEmail: user.email,
        force: parseFloat(Math.abs(sensorData.z).toFixed(2)),
        accelerometer: { x: parseFloat(sensorData.x.toFixed(2)), y: parseFloat(sensorData.y.toFixed(2)), z: parseFloat(sensorData.z.toFixed(2)) },
        location: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy || 0 },
        status: 'reported', severity: calculateSeverity(Math.abs(sensorData.z), baselineThreshold),
        timestamp: serverTimestamp(), roadId: null, assignedTo: null,
        vehicleType: selectedVehicle?.id || 'unknown',
        detectionThreshold: baselineThreshold,
      });
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const ud = snap.data();
        const newScore = (ud.contributionScore || 0) + calculatePoints(Math.abs(sensorData.z), baselineThreshold);
        await setDoc(ref, { ...ud, totalReports: (ud.totalReports || 0) + 1, contributionScore: newScore }, { merge: true });
        setUserProfile(prev => prev ? { ...prev, totalReports: (prev.totalReports || 0) + 1, contributionScore: newScore } : prev);
      }
      setLogs(prev => prev.map(l => l.id === newLog.id ? {...l, status: "SENT ✅"} : l));
      setStatus("SENT SUCCESS");
    } catch (e) {
      setLogs(prev => prev.map(l => l.id === newLog.id ? {...l, status: "FAILED ❌"} : l));
      setStatus("ERROR");
    }
    setTimeout(() => { setIsSending(false); setStatus("ACTIVE"); }, 1500);
  };

  // =================================================================
  // LEADERBOARD & NAVIGATION
  // =================================================================
  const loadLeaderboard = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('contributionScore', 'desc'), limit(10));
      const snap = await getDocs(q);
      setLeaderboard(snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() })));
    } catch (e) { console.error("Leaderboard error:", e); }
  };

  const searchDestination = async () => {
    if (!destinationInput.trim()) return Alert.alert("Error", "Enter a destination!");
    setIsLoading(true);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destinationInput)}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        const coords = data.results[0].geometry.location;
        setDestinationCoords({ latitude: coords.lat, longitude: coords.lng });
        setNavigationActive(true); setShowNavigation(false);
        mapRef.current?.fitToCoordinates(
          [{ latitude: location.latitude, longitude: location.longitude }, { latitude: coords.lat, longitude: coords.lng }],
          { edgePadding: { top: 80, right: 40, bottom: 80, left: 40 }, animated: true }
        );
      } else Alert.alert("Not Found", "Could not find that location. Try adding city name.");
    } catch (e) { Alert.alert("Error", "Could not search. Check internet connection."); }
    finally { setIsLoading(false); }
  };

  const stopNavigation = () => { setNavigationActive(false); setDestinationCoords(null); setDestinationInput(''); setRouteInfo(null); };

  // =================================================================
  // GOVERNMENT & ADMIN
  // =================================================================
  const markRoadAsFixed = async (road) => {
    Alert.alert("Fix Entire Road?", `Mark all ${road.totalPotholes} potholes as fixed?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark as Fixed", onPress: async () => {
        const batch = writeBatch(db);
        road.potholes.forEach(id => batch.update(doc(db, 'potholes', id), { status: 'fixed', fixedBy: user.uid, fixedAt: serverTimestamp() }));
        await batch.commit();
        Alert.alert("Success!", `${road.totalPotholes} potholes marked as fixed.`);
        setSelectedRoad(null);
      }}
    ]);
  };

const changeUserRole = async (uid, newRole) => {
  try {
    await updateDoc(doc(db, 'users', uid), { role: newRole });
    Alert.alert("Success! ✅", `Role changed to ${newRole.toUpperCase()}`);
    loadUsers(); // Refresh the user list
  } catch (error) {
    Alert.alert("Error", `Failed to change role: ${error.message}`);
  }
};

  const loadUsers = async () => {
    const snap = await getDocs(collection(db, 'users'));
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadAdminStats = async () => {
    const usersSnap = await getDocs(collection(db, 'users'));
    const potholesSnap = await getDocs(collection(db, 'potholes'));
    const fixed = potholesSnap.docs.filter(d => d.data().status === 'fixed').length;
    const roughKm = roadSegments.filter(r => r.status === 'rough').reduce((s, r) => s + r.estimatedLength, 0) / 1000;
    const smoothKm = roadSegments.filter(r => r.status === 'smooth').reduce((s, r) => s + r.estimatedLength, 0) / 1000;
    const totalKm = roadSegments.reduce((s, r) => s + r.estimatedLength, 0) / 1000;
    setStats({
      totalUsers: usersSnap.size, totalPotholes: potholesSnap.size, fixedPotholes: fixed,
      activeUsers: usersSnap.docs.filter(d => d.data().totalReports > 0).length,
      roughRoadsKm: roughKm.toFixed(2), smoothRoadsKm: smoothKm.toFixed(2), totalRoadsKm: totalKm.toFixed(2)
    });
    loadUsers();
  };

  // =================================================================
  // HELPERS
  // =================================================================
  const calculateSeverity = (force, threshold) => {
    if (force >= threshold + 0.8) return 'high';
    if (force >= threshold + 0.4) return 'medium';
    return 'low';
  };
  const calculatePoints = (force, threshold) => {
    if (force >= threshold + 0.8) return 15;
    if (force >= threshold + 0.4) return 10;
    return 5;
  };
  const getMarkerColor = s => s === 'high' ? '#ff0000' : s === 'medium' ? '#ff8800' : '#ffff00';
  const getRoadColor = s => s === 'rough' ? '#ff0000' : s === 'moderate' ? '#ffaa00' : '#00ff00';
  const getRankEmoji = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;

  // ANIMATED INTERPOLATIONS
  const inputBorderColor = shineAnim.interpolate({ inputRange: [0,.5,1], outputRange: ['rgba(100,200,255,0.3)','rgba(100,200,255,0.8)','rgba(100,200,255,0.3)'] });
  const inputShadowOpacity = shineAnim.interpolate({ inputRange: [0,.5,1], outputRange: [0.2,0.6,0.2] });
  const socialBorderColor = socialShineAnim.interpolate({ inputRange: [0,.5,1], outputRange: ['rgba(100,200,255,0.4)','rgba(100,230,255,1)','rgba(100,200,255,0.4)'] });
  const socialGlow = socialShineAnim.interpolate({ inputRange: [0,.5,1], outputRange: [0.3,0.8,0.3] });
  const buttonShadowOpacity = buttonShineAnim.interpolate({ inputRange: [0,.5,1], outputRange: [0.4,0.9,0.4] });
  const buttonScale = buttonShineAnim.interpolate({ inputRange: [0,.5,1], outputRange: [1,1.02,1] });
  const titleGlow = loginTitleAnim.interpolate({ inputRange: [0,.5,1], outputRange: ['rgba(100,200,255,0.3)','rgba(100,230,255,0.9)','rgba(100,200,255,0.3)'] });
  const loginTitleTextGlow = loginTitleAnim.interpolate({ inputRange: [0,.5,1], outputRange: [0.3,0.8,0.3] });

  // =================================================================
  // VEHICLE SELECTION SCREEN
  // =================================================================
  if (appScreen === 'vehicleSelect') {
    return (
      <View style={[styles.dashContainer, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <View style={[styles.vehicleHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <Text style={[styles.vehicleHeaderTitle, { color: theme.text }]}>Select Your Vehicle</Text>
          <Text style={[styles.vehicleHeaderSub, { color: theme.textMuted }]}>This helps calibrate pothole detection</Text>
        </View>
        <ScrollView contentContainerStyle={styles.vehicleContainer}>
          <Text style={[styles.vehicleInstructions, { color: theme.textSecondary }]}>
            🤖 RoadSense AI will calibrate itself for your specific vehicle's suspension. Choose what you'll be riding!
          </Text>
          {VEHICLES.map(vehicle => (
            <TouchableOpacity
              key={vehicle.id}
              style={[styles.vehicleCard, { backgroundColor: theme.card2, borderColor: theme.border }]}
              onPress={() => handleVehicleSelect(vehicle)}
              activeOpacity={0.8}
            >
              <Text style={styles.vehicleEmoji}>{vehicle.icon}</Text>
              <View style={styles.vehicleInfo}>
                <Text style={[styles.vehicleName, { color: theme.text }]}>{vehicle.label}</Text>
                <Text style={[styles.vehicleDesc, { color: theme.textMuted }]}>{vehicle.description}</Text>
              </View>
              <View style={[styles.vehicleOffsetBadge, { backgroundColor: theme.card3 }]}>
                <Text style={[styles.vehicleOffsetText, { color: theme.accent }]}>+{vehicle.offset}g</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
          <Text style={[styles.vehicleNote, { color: theme.textMuted }]}>
            ℹ️ You can recalibrate anytime from your Profile page
          </Text>
        </ScrollView>
      </View>
    );
  }

  // =================================================================
  // CALIBRATION SCREEN
  // =================================================================
  if (appScreen === 'calibration') {
    const progress = (CALIBRATION_DURATION - calibrationSeconds) / CALIBRATION_DURATION;
    return (
      <View style={[styles.dashContainer, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle={theme.statusBar} />
        <Text style={[styles.calibTitle, { color: theme.text }]}>Calibrating... 🤖</Text>
        <Text style={[styles.calibSub, { color: theme.textSecondary }]}>
          Drive normally on a smooth road
        </Text>

        {/* ANIMATED CIRCLE */}
        <Animated.View style={[styles.calibCircle, { borderColor: theme.accent, transform: [{ scale: calibrationAnim }] }]}>
          <Text style={[styles.calibSeconds, { color: theme.accent }]}>{calibrationSeconds}</Text>
          <Text style={[styles.calibSecondsLabel, { color: theme.textMuted }]}>seconds left</Text>
        </Animated.View>

        {/* PROGRESS BAR */}
        <View style={[styles.calibProgressBar, { backgroundColor: theme.card3 }]}>
          <View style={[styles.calibProgressFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
        </View>

        <Text style={[styles.calibHint, { color: theme.textMuted }]}>
          📱 Keep your phone mounted on your vehicle{'\n'}
          🛣️ Drive on the smoothest road you can find{'\n'}
          ⏱️ This takes {CALIBRATION_DURATION} seconds
        </Text>

        {/* LIVE READING */}
        <View style={[styles.calibLiveBox, { backgroundColor: theme.card2, borderColor: theme.border }]}>
          <Text style={[styles.calibLiveLabel, { color: theme.textMuted }]}>Live Z-axis reading</Text>
          <Text style={[styles.calibLiveValue, { color: theme.accent }]}>{Math.abs(data.z).toFixed(3)}g</Text>
          <Text style={[styles.calibReadings, { color: theme.textMuted }]}>
            {calibrationReadingsRef.current.length} readings collected
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.calibSkipBtn, { borderColor: theme.border }]}
          onPress={() => finishCalibration(selectedVehicle)}
        >
          <Text style={[styles.calibSkipText, { color: theme.textMuted }]}>Skip calibration</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // =================================================================
  // LOGIN SCREEN
  // =================================================================
  if (appScreen === 'login' || !user || showVerifyEmail) {
    return (
      <ImageBackground source={require('./assets/background.jpg')} style={styles.background} resizeMode="cover">
        <View style={styles.overlay} />

        {/* EMAIL VERIFICATION MODAL */}
        <Modal visible={showVerifyEmail} transparent animationType="slide">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg, alignItems: 'center' }]}>
              <Text style={{ fontSize: 50, marginBottom: 15 }}>📧</Text>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Verify Your Email</Text>
              <Text style={{ color: theme.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 22 }}>
                We sent a verification link to{'\n'}
                <Text style={{ color: theme.accent, fontWeight: 'bold' }}>{user?.email}</Text>
              </Text>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.accent, width: '100%' }]} onPress={checkEmailVerified}>
                <Text style={[styles.dashBtnText, { color: '#000' }]}>I'VE VERIFIED MY EMAIL ✅</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.card3, width: '100%' }]} onPress={resendVerificationEmail}>
                <Text style={[styles.dashBtnText, { color: theme.text }]}>RESEND EMAIL 📨</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: 'transparent', width: '100%' }]} onPress={() => { setShowVerifyEmail(false); setUser(null); }}>
                <Text style={[styles.dashBtnText, { color: theme.textMuted }]}>BACK TO LOGIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            <View style={styles.loginCard}>
              <View style={styles.header}>
                <Image source={require('./assets/logo.png')} style={styles.logo} resizeMode="contain" />
                <Text style={styles.subtitle}>The Pulse of the Pavement</Text>
              </View>
              <View style={styles.loginTitleContainer}>
                <Animated.View style={[styles.dividerLine, { backgroundColor: titleGlow, shadowColor: '#00bfff', shadowOpacity: loginTitleTextGlow, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]} />
                <Animated.Text style={styles.loginTitle}>LOGIN</Animated.Text>
                <Animated.View style={[styles.dividerLine, { backgroundColor: titleGlow, shadowColor: '#00bfff', shadowOpacity: loginTitleTextGlow, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }]} />
              </View>
              <Animated.View style={[styles.inputContainer, { borderColor: inputBorderColor, shadowColor: '#00bfff', shadowOpacity: inputShadowOpacity, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }]}>
                <Ionicons name="mail-outline" size={20} color="#fff" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor="rgba(255,255,255,0.6)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              </Animated.View>
              <Animated.View style={[styles.inputContainer, { borderColor: inputBorderColor, shadowColor: '#00bfff', shadowOpacity: inputShadowOpacity, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }]}>
                <Ionicons name="lock-closed-outline" size={20} color="#fff" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor="rgba(255,255,255,0.6)" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#fff" style={styles.eyeIcon} />
                </TouchableOpacity>
              </Animated.View>
              <Animated.View style={[styles.loginButton, { transform: [{ scale: buttonScale }], shadowColor: '#00d4ff', shadowOpacity: buttonShadowOpacity, shadowRadius: 15, shadowOffset: { width: 0, height: 5 } }]}>
                <TouchableOpacity activeOpacity={0.8} onPress={handleLogin} disabled={isLoading} style={styles.loginButtonTouchable}>
                  <LinearGradient colors={['#00c6ff', '#0072ff', '#00c6ff']} style={styles.loginButtonGradient} start={{x:0,y:0}} end={{x:1,y:0}} locations={[0,0.5,1]}>
                    {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>LOG IN</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
              <TouchableOpacity onPress={() => setShowForgotPassword(true)}>
                <Text style={styles.forgotPassword}>Forgot Password?</Text>
              </TouchableOpacity>
              <View style={styles.orContainer}>
                <View style={styles.orLine} /><Text style={styles.orText}>OR</Text><View style={styles.orLine} />
              </View>
              <View style={styles.socialContainer}>
                <TouchableOpacity style={styles.socialButton} onPress={() => promptAsync()} disabled={!request}>
                  <Animated.View style={[styles.socialButtonInner, { borderColor: socialBorderColor, shadowColor: '#00bfff', shadowOpacity: socialGlow }]}>
                    <FontAwesome name="google" size={20} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton} onPress={() => Alert.alert("Coming Soon", "Facebook sign-in coming soon!")}>
                  <Animated.View style={[styles.socialButtonInner, { borderColor: socialBorderColor, shadowColor: '#00bfff', shadowOpacity: socialGlow }]}>
                    <FontAwesome name="facebook-f" size={20} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton} onPress={() => Alert.alert("Coming Soon", "Apple sign-in coming soon!")}>
                  <Animated.View style={[styles.socialButtonInner, { borderColor: socialBorderColor, shadowColor: '#00bfff', shadowOpacity: socialGlow }]}>
                    <FontAwesome name="apple" size={22} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton} onPress={() => Alert.alert("Coming Soon", "Twitter sign-in coming soon!")}>
                  <Animated.View style={[styles.socialButtonInner, { borderColor: socialBorderColor, shadowColor: '#00bfff', shadowOpacity: socialGlow }]}>
                    <FontAwesome name="twitter" size={20} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton} onPress={() => githubPromptAsync()} disabled={!githubRequest}>
                  <Animated.View style={[styles.socialButtonInner, { borderColor: socialBorderColor, shadowColor: '#00bfff', shadowOpacity: socialGlow }]}>
                    <FontAwesome name="github" size={22} color="#fff" />
                  </Animated.View>
                </TouchableOpacity>
              </View>
              <View style={styles.signUpContainer}>
                <Text style={styles.signUpText}>Don't have an account? </Text>
                <TouchableOpacity onPress={handleSignUp}><Text style={styles.signUpLink}>Sign Up</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>

        {/* FORGOT PASSWORD MODAL */}
        <Modal visible={showForgotPassword} transparent animationType="slide">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}>
            <View style={[styles.modalContent, { backgroundColor: '#18181b', alignItems: 'center' }]}>
              <Text style={{ fontSize: 50, marginBottom: 10 }}>🔑</Text>
              <Text style={[styles.modalTitle, { color: '#fff' }]}>Reset Password</Text>
              <Text style={{ color: '#aaa', textAlign: 'center', marginBottom: 20 }}>Enter your email for a reset link.</Text>
              <View style={[styles.navInputContainer, { backgroundColor: '#27272a', borderColor: '#333', width: '100%', marginBottom: 15 }]}>
                <Ionicons name="mail-outline" size={20} color="#666" style={{ marginRight: 10 }} />
                <TextInput style={[styles.navInput, { color: '#fff' }]} placeholder="Enter your email..." placeholderTextColor="#666" value={forgotEmail} onChangeText={setForgotEmail} autoCapitalize="none" keyboardType="email-address" />
              </View>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#00f3ff', width: '100%' }]} onPress={handleForgotPassword} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#000" /> : <Text style={[styles.dashBtnText, { color: '#000' }]}>SEND RESET LINK 📧</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#27272a', width: '100%' }]} onPress={() => { setShowForgotPassword(false); setForgotEmail(''); }}>
                <Text style={[styles.dashBtnText, { color: '#fff' }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ImageBackground>
    );
  }

  // =================================================================
  // USER DASHBOARD
  // =================================================================
  if (userRole === 'user') {
    return (
      <View style={[styles.dashContainer, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />

        <View style={[styles.dashHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.dashTitle, { color: theme.text }]}>ROADSENSE <Text style={{ color: theme.accent }}>AI</Text></Text>
            <Text style={[styles.roleBadge, { color: theme.textMuted, borderColor: theme.accent }]}>
              {selectedVehicle?.icon} USER MODE
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: theme.card3 }]}>
              <Ionicons name={isDarkMode ? "sunny-outline" : "moon-outline"} size={20} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNavigation(true)} style={[styles.themeBtn, { backgroundColor: theme.card3 }]}>
              <Ionicons name="navigate-outline" size={20} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {navigationActive && routeInfo && (
          <View style={[styles.navBar, { backgroundColor: theme.accent }]}>
            <Ionicons name="navigate" size={16} color="#000" />
            <Text style={styles.navBarText}>{routeInfo.distance} • {routeInfo.duration}</Text>
            <TouchableOpacity onPress={stopNavigation} style={styles.stopNavBtn}>
              <Text style={styles.stopNavText}>STOP</Text>
            </TouchableOpacity>
          </View>
        )}

        {confirmedRoads.length > 0 && (
          <View style={[styles.noticeBanner, { backgroundColor: '#ff000022', borderColor: '#ff0000' }]}>
            <Ionicons name="warning-outline" size={14} color="#ff0000" />
            <Text style={styles.noticeText}>{confirmedRoads.length} confirmed rough road{confirmedRoads.length > 1 ? 's' : ''} nearby</Text>
          </View>
        )}

        {/* BOTTOM NAV */}
        <View style={[styles.bottomNav, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          {[
            { key: 'map', icon: 'map-outline', label: 'Map' },
            { key: 'stats', icon: 'stats-chart-outline', label: 'Stats' },
            { key: 'leaderboard', icon: 'trophy-outline', label: 'Leaders' },
            { key: 'profile', icon: 'person-outline', label: 'Profile' },
          ].map(tab => (
            <TouchableOpacity key={tab.key} style={styles.bottomNavItem} onPress={() => setCurrentScreen(tab.key)}>
              <Ionicons name={tab.icon} size={24} color={currentScreen === tab.key ? theme.accent : theme.textMuted} />
              <Text style={[styles.bottomNavLabel, { color: currentScreen === tab.key ? theme.accent : theme.textMuted }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MAP SCREEN */}
        {currentScreen === 'map' && (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{ latitude: location?.latitude || 11.0168, longitude: location?.longitude || 76.9558, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
              showsUserLocation={true}
              showsMyLocationButton={true}
              customMapStyle={isDarkMode ? darkMapStyle : []}
            >
              {showRoads && confirmedRoads.map(road => (
                <Polyline key={`c_${road.id}`} coordinates={road.coordinates} strokeColor={getRoadColor(road.status)} strokeWidth={7} onPress={() => setSelectedRoad(road)} />
              ))}
              {showRoads && roadSegments.filter(r => !r.isConfirmed && r.potholes.some(pid => myPotholes.find(p => p.id === pid))).map(road => (
                <Polyline key={`m_${road.id}`} coordinates={road.coordinates} strokeColor={getRoadColor(road.status) + '88'} strokeWidth={4} lineDashPattern={[10, 5]} onPress={() => setSelectedRoad(road)} />
              ))}
              {myPotholes.map(p => (
                <Marker key={p.id} coordinate={{ latitude: p.location.latitude, longitude: p.location.longitude }} pinColor={getMarkerColor(p.severity)} onPress={() => setSelectedPothole(p)} />
              ))}
              {navigationActive && destinationCoords && <Marker coordinate={destinationCoords} title="Destination" pinColor="blue" />}
              {navigationActive && destinationCoords && location && (
                <MapViewDirections
                  origin={{ latitude: location.latitude, longitude: location.longitude }}
                  destination={destinationCoords}
                  apikey={GOOGLE_MAPS_API_KEY}
                  strokeWidth={5} strokeColor="#0072ff" optimizeWaypoints={true}
                  onReady={result => {
                    setRouteInfo({ distance: `${result.distance.toFixed(1)} km`, duration: `${Math.round(result.duration)} min` });
                    mapRef.current?.fitToCoordinates(result.coordinates, { edgePadding: { top: 80, right: 40, bottom: 80, left: 40 }, animated: true });
                  }}
                  onError={() => Alert.alert("Route Error", "Could not find a route.")}
                />
              )}
            </MapView>
            <View style={styles.gpsOverlay}>
              <Ionicons name={locationPermission ? "location" : "location-outline"} size={16} color={locationPermission ? "#0f0" : "#f00"} />
              <Text style={styles.gpsText}>{locationPermission ? "GPS Active" : "GPS Disabled"}</Text>
            </View>
            <View style={[styles.statusOverlay, { backgroundColor: isSending ? '#ff0055' : theme.accent }]}>
              <Text style={styles.statusOverlayText}>{status}</Text>
            </View>
            <View style={[styles.legend, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)' }]}>
              <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ff0000' }]} /><Text style={[styles.legendText, { color: theme.text }]}>Confirmed Rough</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#ff880066' }]} /><Text style={[styles.legendText, { color: theme.text }]}>My Reports</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#00ff00' }]} /><Text style={[styles.legendText, { color: theme.text }]}>Fixed</Text></View>
            </View>
            <TouchableOpacity style={[styles.toggleRoadsBtn, { backgroundColor: theme.accent }]} onPress={() => setShowRoads(!showRoads)}>
              <Text style={styles.toggleRoadsBtnText}>{showRoads ? 'HIDE ROADS' : 'SHOW ROADS'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STATS SCREEN */}
        {currentScreen === 'stats' && (
          <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]}>
            <View style={[styles.circle, { borderColor: isSending ? '#ff0055' : theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.valueText, { color: theme.text }]}>{Math.abs(data.z).toFixed(2)}g</Text>
              <Text style={[styles.label, { color: theme.textMuted }]}>IMPACT FORCE</Text>
              {location && <Text style={{ color: '#0f0', fontSize: 10, marginTop: 5 }}>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</Text>}
            </View>

            {/* SMART DETECTION INFO */}
            <View style={[styles.detectionCard, { backgroundColor: theme.card2, borderColor: theme.accent }]}>
              <Text style={[styles.detectionTitle, { color: theme.accent }]}>🤖 Smart Detection</Text>
              <View style={styles.detectionRow}>
                <Text style={[styles.detectionLabel, { color: theme.textSecondary }]}>Vehicle:</Text>
                <Text style={[styles.detectionValue, { color: theme.text }]}>{selectedVehicle?.icon} {selectedVehicle?.label}</Text>
              </View>
              <View style={styles.detectionRow}>
                <Text style={[styles.detectionLabel, { color: theme.textSecondary }]}>Threshold:</Text>
                <Text style={[styles.detectionValue, { color: theme.accent }]}>{baselineThreshold.toFixed(2)}g</Text>
              </View>
              <View style={styles.detectionRow}>
                <Text style={[styles.detectionLabel, { color: theme.textSecondary }]}>Current force:</Text>
                <Text style={[styles.detectionValue, { color: Math.abs(data.z) > baselineThreshold ? '#ff0000' : '#0f0' }]}>{Math.abs(data.z).toFixed(2)}g</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: theme.accent }]}>{myPotholes.length}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>My Reports</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: '#ff0000' }]}>{confirmedRoads.length}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Confirmed Roads</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.dashBtn, { borderColor: theme.border, backgroundColor: theme.card2 }]} onPress={() => setShowLogs(true)}>
              <Text style={[styles.dashBtnText, { color: theme.text }]}>VIEW LOGS ({logs.length})</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* LEADERBOARD SCREEN */}
        {currentScreen === 'leaderboard' && (
          <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, textAlign: 'center', marginTop: 10 }]}>🏆 TOP CONTRIBUTORS</Text>
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginBottom: 20, fontSize: 12 }}>Earn points by reporting potholes!</Text>
            {leaderboard.map(u => (
              <View key={u.id} style={[styles.leaderCard, {
                backgroundColor: u.id === user.uid ? (isDarkMode ? '#001a33' : '#e8f4ff') : theme.card2,
                borderColor: u.id === user.uid ? theme.accent : theme.border,
                borderWidth: u.id === user.uid ? 2 : 1,
              }]}>
                <Text style={styles.rankEmoji}>{getRankEmoji(u.rank)}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.leaderName, { color: theme.text }]}>
                    {u.email?.split('@')[0]}
                    {u.id === user.uid && <Text style={{ color: theme.accent }}> (You)</Text>}
                  </Text>
                  <Text style={[styles.leaderStats, { color: theme.textMuted }]}>{u.totalReports || 0} reports</Text>
                </View>
                <View style={styles.scoreContainer}>
                  <Text style={[styles.scoreValue, { color: theme.accent }]}>{u.contributionScore || 0}</Text>
                  <Text style={[styles.scoreLabel, { color: theme.textMuted }]}>pts</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity style={[styles.dashBtn, { borderColor: theme.border, backgroundColor: theme.card2, marginTop: 10 }]} onPress={loadLeaderboard}>
              <Text style={[styles.dashBtnText, { color: theme.text }]}>REFRESH 🔄</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* PROFILE SCREEN */}
        {currentScreen === 'profile' && (
          <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]}>
            <View style={{ alignItems: 'center', marginBottom: 25 }}>
              <View style={[styles.avatarCircle, { backgroundColor: theme.card3, borderColor: theme.accent }]}>
                <Text style={styles.avatarText}>{user.email?.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={[styles.profileName, { color: theme.text }]}>{user.displayName || user.email?.split('@')[0]}</Text>
              <Text style={[styles.profileEmail, { color: theme.textMuted }]}>{user.email}</Text>
              <View style={[styles.verifiedBadge, { backgroundColor: user.emailVerified ? '#00ff0022' : '#ff000022', borderColor: user.emailVerified ? '#00ff00' : '#ff0000' }]}>
                <Ionicons name={user.emailVerified ? "checkmark-circle" : "alert-circle"} size={14} color={user.emailVerified ? '#00ff00' : '#ff0000'} />
                <Text style={{ color: user.emailVerified ? '#00ff00' : '#ff0000', fontSize: 11, marginLeft: 4, fontWeight: 'bold' }}>
                  {user.emailVerified ? 'Email Verified' : 'Email Not Verified'}
                </Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: theme.accent }]}>{userProfile?.totalReports || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Reports</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
                <Text style={[styles.statValue, { color: '#ffd700' }]}>{userProfile?.contributionScore || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Points</Text>
              </View>
            </View>

            {/* VEHICLE & CALIBRATION INFO */}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>SMART DETECTION</Text>
            <View style={[styles.profileInfoCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
              <View style={styles.profileInfoRow}>
                <Text style={{ fontSize: 20 }}>{selectedVehicle?.icon || '🚗'}</Text>
                <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Vehicle</Text>
                <Text style={[styles.profileInfoValue, { color: theme.text }]}>{selectedVehicle?.label || 'Not set'}</Text>
              </View>
              <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />
              <View style={styles.profileInfoRow}>
                <Ionicons name="analytics-outline" size={18} color={theme.accent} />
                <Text style={[styles.profileInfoLabel, { color: theme.textSecondary }]}>Detection Threshold</Text>
                <Text style={[styles.profileInfoValue, { color: theme.accent }]}>{baselineThreshold.toFixed(2)}g</Text>
              </View>
            </View>

            {/* RECALIBRATE BUTTON */}
            <TouchableOpacity style={[styles.dashBtn, { borderColor: theme.accent, backgroundColor: theme.accent + '22', marginBottom: 10 }]} onPress={handleRecalibrate}>
              <Text style={[styles.dashBtnText, { color: theme.accent }]}>🤖 RECALIBRATE DETECTION</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: theme.text }]}>POINTS BREAKDOWN</Text>
            <View style={[styles.profileInfoCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
              <View style={styles.profileInfoRow}>
                <Text style={{ fontSize: 18 }}>🔴</Text>
                <Text style={[styles.profileInfoLabel, { color: theme.textSecondary, flex: 1 }]}>High severity</Text>
                <Text style={[styles.profileInfoValue, { color: '#ffd700' }]}>+15 pts</Text>
              </View>
              <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />
              <View style={styles.profileInfoRow}>
                <Text style={{ fontSize: 18 }}>🟠</Text>
                <Text style={[styles.profileInfoLabel, { color: theme.textSecondary, flex: 1 }]}>Medium severity</Text>
                <Text style={[styles.profileInfoValue, { color: '#ffd700' }]}>+10 pts</Text>
              </View>
              <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />
              <View style={styles.profileInfoRow}>
                <Text style={{ fontSize: 18 }}>🟡</Text>
                <Text style={[styles.profileInfoLabel, { color: theme.textSecondary, flex: 1 }]}>Low severity</Text>
                <Text style={[styles.profileInfoValue, { color: '#ffd700' }]}>+5 pts</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.dashBtn, { borderColor: '#ff0000', backgroundColor: '#ff000022', marginTop: 10 }]} onPress={handleLogout}>
              <Text style={[styles.dashBtnText, { color: '#ff0000' }]}>LOGOUT 🚪</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* NAVIGATION MODAL */}
        <Modal visible={showNavigation} transparent animationType="slide">
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>NAVIGATION</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 15, textAlign: 'center' }}>
                Confirmed rough roads shown along your route!
              </Text>
              <View style={[styles.navInputContainer, { backgroundColor: theme.card2, borderColor: theme.border }]}>
                <Ionicons name="search-outline" size={20} color={theme.textMuted} style={{ marginRight: 10 }} />
                <TextInput style={[styles.navInput, { color: theme.text }]} placeholder="Enter destination (include city)..." placeholderTextColor={theme.textMuted} value={destinationInput} onChangeText={setDestinationInput} onSubmitEditing={searchDestination} />
              </View>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.accent, marginTop: 15 }]} onPress={searchDestination} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#000" /> : <Text style={[styles.dashBtnText, { color: '#000' }]}>START NAVIGATION</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.card3 }]} onPress={() => setShowNavigation(false)}>
                <Text style={[styles.dashBtnText, { color: theme.text }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ROAD DETAILS MODAL */}
        <Modal visible={!!selectedRoad} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>ROAD SEGMENT</Text>
              {selectedRoad && (
                <View style={styles.detailsContainer}>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Status: {selectedRoad.status.toUpperCase()}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Potholes: {selectedRoad.totalPotholes}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Reported by: {selectedRoad.uniqueUsers} user(s)</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Avg Force: {selectedRoad.averageForce.toFixed(2)}g</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Length: {(selectedRoad.estimatedLength/1000).toFixed(2)} km</Text>
                  <View style={[styles.statusBadge, { backgroundColor: selectedRoad.isConfirmed ? '#ff000033' : '#ffaa0033', borderWidth: 1, borderColor: selectedRoad.isConfirmed ? '#ff0000' : '#ffaa00' }]}>
                    <Text style={[styles.statusBadgeText, { color: selectedRoad.isConfirmed ? '#ff0000' : '#ffaa00' }]}>
                      {selectedRoad.isConfirmed ? 'CONFIRMED ROUGH ROAD' : 'UNCONFIRMED - needs more reports'}
                    </Text>
                  </View>
                </View>
              )}
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.card3 }]} onPress={() => setSelectedRoad(null)}>
                <Text style={[styles.dashBtnText, { color: theme.text }]}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* POTHOLE MODAL */}
        <Modal visible={!!selectedPothole} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>POTHOLE DETAILS</Text>
              {selectedPothole && (
                <View style={styles.detailsContainer}>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Force: {selectedPothole.force}g</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Severity: {selectedPothole.severity?.toUpperCase()}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Vehicle: {selectedPothole.vehicleType}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Location: {selectedPothole.location?.latitude.toFixed(4)}, {selectedPothole.location?.longitude.toFixed(4)}</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.card3 }]} onPress={() => setSelectedPothole(null)}>
                <Text style={[styles.dashBtnText, { color: theme.text }]}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* LOGS MODAL */}
        <Modal visible={showLogs} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>TRANSMISSION HISTORY</Text>
              <ScrollView style={{ width: '100%' }}>
                {logs.length === 0
                  ? <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>No logs yet.</Text>
                  : logs.map(l => (
                    <View key={l.id} style={[styles.logItem, { borderColor: theme.border }]}>
                      <Text style={{ color: theme.textSecondary }}>{l.time}</Text>
                      <Text style={{ color: l.status.includes("SENT") ? '#0f0' : l.status.includes("FAILED") ? '#f00' : '#ff0', fontWeight: 'bold' }}>{l.status}</Text>
                    </View>
                  ))
                }
              </ScrollView>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.card3 }]} onPress={() => setShowLogs(false)}>
                <Text style={[styles.dashBtnText, { color: theme.text }]}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // =================================================================
  // GOVERNMENT DASHBOARD
  // =================================================================
  if (userRole === 'government') {
    const filteredRoads = filterStatus === 'all' ? roadSegments : roadSegments.filter(r => r.status === filterStatus);
    return (
      <View style={[styles.dashContainer, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <View style={[styles.dashHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.dashTitle, { color: theme.text }]}>GOVERNMENT <Text style={{ color: '#ff8800' }}>PORTAL</Text></Text>
            <Text style={[styles.roleBadge, { color: theme.textMuted, borderColor: '#ff8800' }]}>GOVERNMENT MODE</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: theme.card3 }]}>
              <Ionicons name={isDarkMode ? "sunny-outline" : "moon-outline"} size={20} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView horizontal style={[styles.filterContainer, { backgroundColor: theme.card2 }]}>
          {['all', 'rough', 'moderate', 'smooth'].map(f => (
            <TouchableOpacity key={f} style={[styles.filterBtn, { backgroundColor: filterStatus === f ? '#ff8800' : theme.card3 }]} onPress={() => setFilterStatus(f)}>
              <Text style={[styles.filterText, { color: filterStatus === f ? '#000' : theme.textMuted }]}>{f.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.mapContainer}>
          <MapView style={styles.map} provider={PROVIDER_GOOGLE} initialRegion={{ latitude: 11.0168, longitude: 76.9558, latitudeDelta: 0.1, longitudeDelta: 0.1 }} customMapStyle={isDarkMode ? darkMapStyle : []}>
            {filteredRoads.map(road => (
              <Polyline key={road.id} coordinates={road.coordinates} strokeColor={getRoadColor(road.status)} strokeWidth={road.isConfirmed ? 7 : 4} tappable onPress={() => setSelectedRoad(road)} />
            ))}
          </MapView>
        </View>
        <View style={[styles.govStatsBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={styles.govStatItem}><Text style={[styles.govStatValue, { color: theme.text }]}>{roadSegments.length}</Text><Text style={[styles.govStatLabel, { color: theme.textMuted }]}>Total</Text></View>
          <View style={styles.govStatItem}><Text style={[styles.govStatValue, { color: '#f00' }]}>{roadSegments.filter(r => r.status === 'rough').length}</Text><Text style={[styles.govStatLabel, { color: theme.textMuted }]}>Rough</Text></View>
          <View style={styles.govStatItem}><Text style={[styles.govStatValue, { color: '#0f0' }]}>{roadSegments.filter(r => r.status === 'smooth').length}</Text><Text style={[styles.govStatLabel, { color: theme.textMuted }]}>Fixed</Text></View>
          <View style={styles.govStatItem}><Text style={[styles.govStatValue, { color: '#ff8800' }]}>{confirmedRoads.length}</Text><Text style={[styles.govStatLabel, { color: theme.textMuted }]}>Confirmed</Text></View>
        </View>
        <Modal visible={!!selectedRoad} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>MANAGE ROAD</Text>
              {selectedRoad && (
                <View style={styles.detailsContainer}>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Status: {selectedRoad.status.toUpperCase()}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Potholes: {selectedRoad.totalPotholes}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Reporters: {selectedRoad.uniqueUsers}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Confirmed: {selectedRoad.isConfirmed ? 'Yes ✅' : 'No ❌'}</Text>
                  <Text style={[styles.detailText, { color: theme.textSecondary }]}>Length: ~{(selectedRoad.estimatedLength/1000).toFixed(2)} km</Text>
                  {selectedRoad.status !== 'smooth' && (
                    <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#0f0', marginTop: 20 }]} onPress={() => markRoadAsFixed(selectedRoad)}>
                      <Text style={[styles.dashBtnText, { color: '#000' }]}>MARK ROAD AS FIXED</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.card3 }]} onPress={() => setSelectedRoad(null)}>
                <Text style={[styles.dashBtnText, { color: theme.text }]}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // =================================================================
  // ADMIN DASHBOARD
  // =================================================================
  if (userRole === 'admin') {
    return (
      <View style={[styles.dashContainer, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={theme.statusBar} />
        <View style={[styles.dashHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <View>
            <Text style={[styles.dashTitle, { color: theme.text }]}>ADMIN <Text style={{ color: '#f0f' }}>CONTROL</Text></Text>
            <Text style={[styles.roleBadge, { color: theme.textMuted, borderColor: '#f0f' }]}>ADMIN MODE</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: theme.card3 }]}>
              <Ionicons name={isDarkMode ? "sunny-outline" : "moon-outline"} size={20} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView style={[styles.adminContainer, { backgroundColor: theme.background }]}>
          <View style={styles.adminStatsGrid}>
            <View style={[styles.adminStatCard, { backgroundColor: theme.card2, borderColor: theme.border }]}><MaterialIcons name="people" size={40} color="#00f3ff" /><Text style={[styles.adminStatValue, { color: theme.text }]}>{stats.totalUsers}</Text><Text style={[styles.adminStatLabel, { color: theme.textMuted }]}>Users</Text></View>
            <View style={[styles.adminStatCard, { backgroundColor: theme.card2, borderColor: theme.border }]}><MaterialIcons name="warning" size={40} color="#ff0" /><Text style={[styles.adminStatValue, { color: theme.text }]}>{stats.totalPotholes}</Text><Text style={[styles.adminStatLabel, { color: theme.textMuted }]}>Potholes</Text></View>
            <View style={[styles.adminStatCard, { backgroundColor: theme.card2, borderColor: theme.border }]}><MaterialIcons name="check-circle" size={40} color="#0f0" /><Text style={[styles.adminStatValue, { color: theme.text }]}>{stats.fixedPotholes}</Text><Text style={[styles.adminStatLabel, { color: theme.textMuted }]}>Fixed</Text></View>
            <View style={[styles.adminStatCard, { backgroundColor: theme.card2, borderColor: theme.border }]}><MaterialIcons name="trending-up" size={40} color="#f0f" /><Text style={[styles.adminStatValue, { color: theme.text }]}>{confirmedRoads.length}</Text><Text style={[styles.adminStatLabel, { color: theme.textMuted }]}>Confirmed</Text></View>
          </View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>ROAD NETWORK</Text>
          <View style={[styles.roadStatsContainer, { backgroundColor: theme.card2, borderColor: theme.border }]}>
            <View style={styles.roadStatRow}><Text style={[styles.roadStatLabel, { color: theme.textSecondary }]}>Total:</Text><Text style={[styles.roadStatValue, { color: theme.text }]}>{stats.totalRoadsKm} km</Text></View>
            <View style={styles.roadStatRow}><Text style={[styles.roadStatLabel, { color: '#f00' }]}>Rough:</Text><Text style={[styles.roadStatValue, { color: '#f00' }]}>{stats.roughRoadsKm} km</Text></View>
            <View style={styles.roadStatRow}><Text style={[styles.roadStatLabel, { color: '#0f0' }]}>Fixed:</Text><Text style={[styles.roadStatValue, { color: '#0f0' }]}>{stats.smoothRoadsKm} km</Text></View>
            <View style={styles.roadStatRow}><Text style={[styles.roadStatLabel, { color: theme.textSecondary }]}>Completion:</Text><Text style={[styles.roadStatValue, { color: theme.text }]}>{stats.totalRoadsKm > 0 ? ((stats.smoothRoadsKm / stats.totalRoadsKm) * 100).toFixed(1) : 0}%</Text></View>
          </View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>USER MANAGEMENT</Text>
          {users.map(u => (
            <View key={u.id} style={[styles.userCard, { backgroundColor: theme.card2, borderColor: theme.border }]}>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.text }]}>{u.email}</Text>
                <Text style={[styles.userRole, { color: theme.accent }]}>Role: {u.role?.toUpperCase()}</Text>
                <Text style={[styles.userStats, { color: theme.textMuted }]}>Reports: {u.totalReports || 0} | Score: {u.contributionScore || 0}</Text>
              </View>
              <View style={styles.roleButtons}>
                <TouchableOpacity style={[styles.roleBtn, { backgroundColor: u.role === 'user' ? theme.accent : theme.card3 }]} onPress={() => changeUserRole(u.id, 'user')}><Text style={[styles.roleBtnText, { color: u.role === 'user' ? '#000' : theme.text }]}>User</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.roleBtn, { backgroundColor: u.role === 'government' ? '#ff8800' : theme.card3 }]} onPress={() => changeUserRole(u.id, 'government')}><Text style={[styles.roleBtnText, { color: u.role === 'government' ? '#000' : theme.text }]}>Gov</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.roleBtn, { backgroundColor: u.role === 'admin' ? '#f0f' : theme.card3 }]} onPress={() => changeUserRole(u.id, 'admin')}><Text style={[styles.roleBtnText, { color: u.role === 'admin' ? '#000' : theme.text }]}>Admin</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return null;
}

// =================================================================
// DARK MAP STYLE
// =================================================================
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#383838" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#616161" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
];

// =================================================================
// STYLES
// =================================================================
const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginCard: { width: '100%', maxWidth: 400, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 30, paddingVertical: 35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 }, android: { elevation: 10 } }) },
  header: { alignItems: 'center', marginBottom: 25 },
  logo: { width: 200, height: 50, marginBottom: 8 },
  subtitle: { fontSize: 12, color: '#ffffff', fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase' },
  loginTitleContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, marginTop: 5 },
  dividerLine: { flex: 1, height: 2, elevation: 4 },
  loginTitle: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 4, marginHorizontal: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 25, paddingHorizontal: 18, paddingVertical: 12, marginBottom: 15, borderWidth: 2, elevation: 8 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#fff', paddingVertical: 2 },
  eyeIcon: { marginLeft: 10 },
  loginButton: { borderRadius: 30, overflow: 'hidden', marginTop: 5, marginBottom: 15, elevation: 10 },
  loginButtonTouchable: { borderRadius: 30, overflow: 'hidden' },
  loginButtonGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 30 },
  loginButtonText: { fontSize: 17, fontWeight: 'bold', color: '#fff', letterSpacing: 1.5, textTransform: 'uppercase' },
  forgotPassword: { fontSize: 13, color: '#fff', textAlign: 'center', marginBottom: 20, textDecorationLine: 'underline' },
  orContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  orLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  orText: { color: 'rgba(255,255,255,0.7)', marginHorizontal: 15, fontSize: 13, fontWeight: '600' },
  socialContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 25, gap: 12 },
  socialButton: { width: 50, height: 50 },
  socialButtonInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, elevation: 8 },
  signUpContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signUpText: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  signUpLink: { fontSize: 13, color: '#4db8ff', fontWeight: 'bold', textDecorationLine: 'underline' },
  // VEHICLE SELECT
  vehicleHeader: { paddingTop: 55, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1 },
  vehicleHeaderTitle: { fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  vehicleHeaderSub: { fontSize: 13, marginTop: 4 },
  vehicleContainer: { padding: 20 },
  vehicleInstructions: { fontSize: 14, lineHeight: 22, marginBottom: 25, textAlign: 'center' },
  vehicleCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 16, marginBottom: 15, borderWidth: 1, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }, android: { elevation: 3 } }) },
  vehicleEmoji: { fontSize: 36, marginRight: 15 },
  vehicleInfo: { flex: 1 },
  vehicleName: { fontSize: 18, fontWeight: 'bold' },
  vehicleDesc: { fontSize: 12, marginTop: 3 },
  vehicleOffsetBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginRight: 10 },
  vehicleOffsetText: { fontSize: 12, fontWeight: 'bold' },
  vehicleNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },
  // CALIBRATION
  calibTitle: { fontSize: 28, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 60 },
  calibSub: { fontSize: 15, marginBottom: 40, textAlign: 'center', paddingHorizontal: 30 },
  calibCircle: { width: 200, height: 200, borderRadius: 100, borderWidth: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 40 },
  calibSeconds: { fontSize: 56, fontWeight: 'bold' },
  calibSecondsLabel: { fontSize: 12, marginTop: 5 },
  calibProgressBar: { width: '80%', height: 8, borderRadius: 4, marginBottom: 30, overflow: 'hidden' },
  calibProgressFill: { height: '100%', borderRadius: 4 },
  calibHint: { fontSize: 13, lineHeight: 24, textAlign: 'center', paddingHorizontal: 30, marginBottom: 25 },
  calibLiveBox: { width: '80%', padding: 15, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 20 },
  calibLiveLabel: { fontSize: 11, marginBottom: 5 },
  calibLiveValue: { fontSize: 28, fontWeight: 'bold' },
  calibReadings: { fontSize: 11, marginTop: 5 },
  calibSkipBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  calibSkipText: { fontSize: 13 },
  // DETECTION CARD
  detectionCard: { borderRadius: 12, borderWidth: 2, padding: 15, marginBottom: 20 },
  detectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 12, letterSpacing: 1 },
  detectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  detectionLabel: { fontSize: 13 },
  detectionValue: { fontSize: 13, fontWeight: 'bold' },
  // DASHBOARD
  dashContainer: { flex: 1 },
  dashHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, borderBottomWidth: 1 },
  dashTitle: { fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  roleBadge: { fontSize: 10, fontWeight: 'bold', borderWidth: 1, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, marginTop: 5, alignSelf: 'flex-start' },
  logoutBtn: { padding: 10 },
  themeBtn: { padding: 8, borderRadius: 20 },
  navBar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 15, gap: 10 },
  navBarText: { flex: 1, color: '#000', fontWeight: 'bold', fontSize: 13 },
  stopNavBtn: { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  stopNavText: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  noticeBanner: { flexDirection: 'row', alignItems: 'center', padding: 8, paddingHorizontal: 15, borderBottomWidth: 1, gap: 8 },
  noticeText: { fontSize: 12, color: '#ff0000', fontWeight: '600' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 20 : 5 },
  bottomNavItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  bottomNavLabel: { fontSize: 10, marginTop: 3, fontWeight: '600' },
  mapContainer: { flex: 1, margin: 10, borderRadius: 15, overflow: 'hidden', position: 'relative' },
  map: { flex: 1 },
  gpsOverlay: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15 },
  gpsText: { color: '#ccc', fontSize: 10, marginLeft: 5 },
  statusOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10, padding: 15, borderRadius: 10, alignItems: 'center' },
  statusOverlayText: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  legend: { position: 'absolute', top: 10, left: 10, padding: 10, borderRadius: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  legendLine: { width: 30, height: 4, borderRadius: 2, marginRight: 8 },
  legendText: { fontSize: 11 },
  toggleRoadsBtn: { position: 'absolute', bottom: 70, left: 10, right: 10, padding: 12, borderRadius: 10, alignItems: 'center' },
  toggleRoadsBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
  statsContainer: { flex: 1, padding: 20 },
  circle: { width: 220, height: 220, borderRadius: 110, borderWidth: 5, alignItems: 'center', justifyContent: 'center', marginBottom: 30, alignSelf: 'center' },
  valueText: { fontSize: 50, fontWeight: 'bold' },
  label: { marginTop: 10, letterSpacing: 2, fontSize: 10 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, padding: 20, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  statValue: { fontSize: 32, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 5, textAlign: 'center' },
  dashBtn: { padding: 15, borderWidth: 1, borderRadius: 30, alignItems: 'center', marginVertical: 10 },
  dashBtnText: { fontWeight: 'bold', fontSize: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 10, letterSpacing: 1 },
  leaderCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1 },
  rankEmoji: { fontSize: 24, minWidth: 35, textAlign: 'center' },
  leaderName: { fontSize: 14, fontWeight: 'bold' },
  leaderStats: { fontSize: 12, marginTop: 2 },
  scoreContainer: { alignItems: 'center' },
  scoreValue: { fontSize: 22, fontWeight: 'bold' },
  scoreLabel: { fontSize: 11 },
  avatarCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  profileEmail: { fontSize: 13, marginBottom: 10 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  profileInfoCard: { borderRadius: 12, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  profileInfoRow: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12 },
  profileInfoLabel: { fontSize: 14, flex: 1 },
  profileInfoValue: { fontSize: 14, fontWeight: 'bold' },
  profileDivider: { height: 1, marginHorizontal: 15 },
  filterContainer: { flexDirection: 'row', padding: 10 },
  filterBtn: { paddingHorizontal: 15, paddingVertical: 8, marginHorizontal: 5, borderRadius: 15 },
  filterText: { fontSize: 11, fontWeight: 'bold' },
  govStatsBar: { flexDirection: 'row', padding: 15, borderTopWidth: 1 },
  govStatItem: { flex: 1, alignItems: 'center' },
  govStatValue: { fontSize: 24, fontWeight: 'bold' },
  govStatLabel: { fontSize: 10, marginTop: 3 },
  adminContainer: { flex: 1, padding: 20 },
  adminStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  adminStatCard: { width: '48%', padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  adminStatValue: { fontSize: 28, fontWeight: 'bold', marginVertical: 5 },
  adminStatLabel: { fontSize: 11, textAlign: 'center' },
  roadStatsContainer: { padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1 },
  roadStatRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  roadStatLabel: { fontSize: 14 },
  roadStatValue: { fontSize: 14, fontWeight: 'bold' },
  userCard: { padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1 },
  userInfo: { marginBottom: 10 },
  userName: { fontSize: 14, fontWeight: 'bold' },
  userRole: { fontSize: 12, marginTop: 3 },
  userStats: { fontSize: 11, marginTop: 3 },
  roleButtons: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  roleBtnText: { fontSize: 11, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 20, borderRadius: 20, maxHeight: '85%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  detailsContainer: { width: '100%', marginBottom: 20 },
  detailText: { fontSize: 14, marginBottom: 8 },
  statusBadge: { padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  statusBadgeText: { fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1 },
  closeBtn: { marginTop: 10, padding: 15, borderRadius: 10, alignItems: 'center' },
  navInputContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, borderWidth: 1 },
  navInput: { flex: 1, fontSize: 15 },
});