import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Dimensions } from 'react-native';
import { useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemedView } from '@/components/ThemedView';
import { ExpandedPlayer } from '@/components/BottomSheet/ExpandedPlayer';
import { useRootScale } from '@/app/contexts/RootScaleContext';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { songs } from '@/app/data/songs.json';
import * as Haptics from 'expo-haptics';

const SCALE_FACTOR = 0.83;
const DRAG_THRESHOLD = 100;

export default function MusicScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { setScale } = useRootScale();
    const translateY = useSharedValue(0);
    const isClosing = useRef(false);
    const statusBarStyle = useSharedValue<'light' | 'dark'>('light');
    const scrollOffset = useSharedValue(0);
    const isDragging = useSharedValue(false);

    const numericId = typeof id === 'string' ? parseInt(id, 10) : Array.isArray(id) ? parseInt(id[0], 10) : 0;
    const song = songs.find(s => s.id === numericId) || songs[0];

    const handleHapticFeedback = useCallback(() => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (error) {
            console.log('Haptics not available:', error);
        }
    }, []);

    const goBack = useCallback(() => {
        if (!isClosing.current) {
            isClosing.current = true;
            handleHapticFeedback();
            requestAnimationFrame(() => {
                router.back();
            });
        }
    }, [router, handleHapticFeedback]);

    const handleScale = useCallback((newScale: number) => {
        try {
            setScale(newScale);
        } catch (error) {
            console.log('Scale error:', error);
        }
    }, [setScale]);

    const panGesture = Gesture.Pan()
        .onStart(() => {
            'worklet';
            if (scrollOffset.value <= 0) {
                isDragging.value = true;
                translateY.value = 0;
            }
        })
        .onUpdate((event) => {
            'worklet';
            if (scrollOffset.value <= 0 && isDragging.value) {
                translateY.value = Math.max(0, event.translationY);
                const progress = Math.min(event.translationY / 600, 1);
                const newScale = SCALE_FACTOR + (progress * (1 - SCALE_FACTOR));
                runOnJS(handleScale)(newScale);

                if (progress > 0.5) {
                    statusBarStyle.value = 'dark';
                } else {
                    statusBarStyle.value = 'light';
                }
            }
        })
        .onEnd((event) => {
            'worklet';
            isDragging.value = false;
            if (scrollOffset.value <= 0) {
                const shouldClose = event.translationY > DRAG_THRESHOLD;

                if (shouldClose) {
                    translateY.value = withTiming(event.translationY + 100, {
                        duration: 300,
                    });
                    runOnJS(handleScale)(1);
                    runOnJS(handleHapticFeedback)();
                    runOnJS(goBack)();
                } else {
                    translateY.value = withSpring(0, {
                        damping: 15,
                        stiffness: 150,
                    });
                    runOnJS(handleScale)(SCALE_FACTOR);
                }
            }
        })
        .onFinalize(() => {
            'worklet';
            isDragging.value = false;
        });

    const scrollGesture = Gesture.Native()
        .onBegin(() => {
            'worklet';
            if (!isDragging.value) {
                translateY.value = 0;
            }
        });

    const composedGestures = Gesture.Simultaneous(panGesture, scrollGesture);

    const ScrollComponent = useCallback((props: any) => {
        return (
            <GestureDetector gesture={composedGestures}>
                <Animated.ScrollView
                    {...props}
                    onScroll={(event) => {
                        'worklet';
                        scrollOffset.value = event.nativeEvent.contentOffset.y;
                        if (!isDragging.value && translateY.value !== 0) {
                            translateY.value = 0;
                        }
                        props.onScroll?.(event);
                    }}
                    scrollEventThrottle={16}
                    // bounces={scrollOffset.value >= 0 && !isDragging.value}
                    bounces={false}


                />
            </GestureDetector>
        );
    }, [composedGestures]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: withSpring(1),
    }));

    useEffect(() => {
        const timeout = setTimeout(() => {
            try {
                setScale(SCALE_FACTOR);
            } catch (error) {
                console.log('Initial scale error:', error);
            }
        }, 0);

        return () => {
            clearTimeout(timeout);
            try {
                setScale(1);
            } catch (error) {
                console.log('Cleanup scale error:', error);
            }
        };
    }, []);

    return (
        <ThemedView style={styles.container}>
            <StatusBar animated={true} style={statusBarStyle.value} />
            <Animated.View style={[styles.modalContent, animatedStyle]}>
                <ExpandedPlayer scrollComponent={ScrollComponent} />
            </Animated.View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    modalContent: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
