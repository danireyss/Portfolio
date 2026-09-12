//! Locks that shrug off poisoning. A thread that panics while holding one leaves plain data behind
//! (a cache, the content being served), which is still fine to read and overwrite, so the rest of
//! the server carries on instead of panicking too.

use std::sync::{Mutex, MutexGuard, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};

pub(crate) trait MutexExt<T> {
    fn lock_ignoring_poison(&self) -> MutexGuard<'_, T>;
}

impl<T> MutexExt<T> for Mutex<T> {
    fn lock_ignoring_poison(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub(crate) trait RwLockExt<T> {
    fn read_ignoring_poison(&self) -> RwLockReadGuard<'_, T>;
    fn write_ignoring_poison(&self) -> RwLockWriteGuard<'_, T>;
}

impl<T> RwLockExt<T> for RwLock<T> {
    fn read_ignoring_poison(&self) -> RwLockReadGuard<'_, T> {
        self.read().unwrap_or_else(PoisonError::into_inner)
    }

    fn write_ignoring_poison(&self) -> RwLockWriteGuard<'_, T> {
        self.write().unwrap_or_else(PoisonError::into_inner)
    }
}
