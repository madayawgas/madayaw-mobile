import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export type BackHandlerCallback = () => boolean | null | undefined;

/**
 * Custom React hook to register an Android hardware back press listener.
 * Maintains LIFO registration order while always executing the latest callback closure.
 *
 * @param handler Callback returning `true` if handled, `false` to propagate.
 * @param isEnabled Whether the listener is currently active.
 */
export function useBackHandler(
  handler: BackHandlerCallback,
  isEnabled: boolean = true
): void {
  const handlerRef = useRef<BackHandlerCallback>(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!isEnabled) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (handlerRef.current) {
        return Boolean(handlerRef.current());
      }
      return false;
    });

    return () => subscription.remove();
  }, [isEnabled]);
}
