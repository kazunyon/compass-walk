import {useSyncExternalStore} from 'react'
import {getSyncState,subscribeSync} from '../sync'

export function useSyncState(){return useSyncExternalStore(subscribeSync,getSyncState,getSyncState)}
