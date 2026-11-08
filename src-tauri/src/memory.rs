// Memory optimization module: Windows Working Set Trimming

#[cfg(windows)]
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn SetProcessWorkingSetSize(h_process: isize, min: usize, max: usize) -> i32;
}

pub fn trim_working_set() {
    #[cfg(windows)]
    unsafe {
        let handle = GetCurrentProcess();
        // Passing (usize::MAX, usize::MAX) instructs Windows Memory Manager to trim working set
        SetProcessWorkingSetSize(handle, usize::MAX, usize::MAX);
    }
}
