Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public static class DarsWindowsMetrics {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry {
        public uint Size, Usage, Pid;
        public UIntPtr DefaultHeap;
        public uint Module, Threads, ParentPid;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Image;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryEx2 {
        public uint Size, PageFaultCount;
        public UIntPtr PeakWorkingSet, WorkingSet, QuotaPeakPaged, QuotaPaged;
        public UIntPtr QuotaPeakNonPaged, QuotaNonPaged, Pagefile, PeakPagefile;
        public UIntPtr PrivateUsage, PrivateWorkingSet;
        public ulong SharedCommit;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PerformanceInfo {
        public uint Size;
        public UIntPtr CommitTotal, CommitLimit, CommitPeak, PhysicalTotal, PhysicalAvailable;
        public UIntPtr SystemCache, KernelTotal, KernelPaged, KernelNonPaged, PageSize;
        public uint Handles, Processes, Threads;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry process);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint desiredAccess, bool inherit, uint pid);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool K32GetProcessMemoryInfo(IntPtr process, ref MemoryEx2 memory, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool K32GetPerformanceInfo(ref PerformanceInfo info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam);

    private static ProcessEntry[] ProcessTable() {
        IntPtr handle = CreateToolhelp32Snapshot(2, 0);
        if (handle == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf<ProcessEntry>() };
            if (!Process32FirstW(handle, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error());
            var entries = new List<ProcessEntry>();
            do { entries.Add(entry); } while (Process32NextW(handle, ref entry));
            return entries.ToArray();
        } finally { CloseHandle(handle); }
    }

    public static object[] ReadTree(int rootPid) {
        if (rootPid == 0) return Array.Empty<object>();
        ProcessEntry[] entries = ProcessTable();
        var included = new HashSet<uint> { (uint)rootPid };
        int previous;
        do {
            previous = included.Count;
            foreach (ProcessEntry row in entries) {
                if (included.Contains(row.ParentPid)) included.Add(row.Pid);
            }
        } while (included.Count != previous);

        var result = new List<object>();
        foreach (ProcessEntry entry in entries) {
            if (!included.Contains(entry.Pid)) continue;
            bool host = entry.Pid == rootPid;
            IntPtr handle = OpenProcess(0x1000, false, entry.Pid);
            if (handle == IntPtr.Zero) {
                result.Add(new { pid = entry.Pid, host, image = entry.Image, error = Marshal.GetLastWin32Error() });
                continue;
            }
            try {
                long creation, exit, kernel, user;
                var memory = new MemoryEx2 { Size = (uint)Marshal.SizeOf<MemoryEx2>() };
                if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)
                    || !K32GetProcessMemoryInfo(handle, ref memory, memory.Size)) {
                    result.Add(new { pid = entry.Pid, host, image = entry.Image, error = Marshal.GetLastWin32Error() });
                    continue;
                }
                result.Add(new {
                    pid = entry.Pid, host, image = entry.Image,
                    creation = creation.ToString(CultureInfo.InvariantCulture),
                    cpu100ns = kernel + user,
                    workingSetBytes = memory.WorkingSet.ToUInt64(),
                    privateWorkingSetBytes = memory.PrivateWorkingSet.ToUInt64(),
                    privateBytes = memory.PrivateUsage.ToUInt64(),
                    sharedCommitBytes = memory.SharedCommit
                });
            } finally { CloseHandle(handle); }
        }
        return result.ToArray();
    }

    public static object ReadSystem() {
        var info = new PerformanceInfo { Size = (uint)Marshal.SizeOf<PerformanceInfo>() };
        if (!K32GetPerformanceInfo(ref info, info.Size)) throw new Win32Exception(Marshal.GetLastWin32Error());
        long idle, kernel, user;
        if (!GetSystemTimes(out idle, out kernel, out user)) throw new Win32Exception(Marshal.GetLastWin32Error());
        ulong pageSize = info.PageSize.ToUInt64();
        return new {
            committedBytes = info.CommitTotal.ToUInt64() * pageSize,
            physicalInUseBytes = (info.PhysicalTotal.ToUInt64() - info.PhysicalAvailable.ToUInt64()) * pageSize,
            idle100ns = idle, kernel100ns = kernel, user100ns = user
        };
    }

    private static IntPtr trackedWindow;

    private static IntPtr MainWindow(int pid) {
        if (pid <= 0) return IntPtr.Zero;
        if (trackedWindow != IntPtr.Zero
            && GetWindowThreadProcessId(trackedWindow, out uint owner) != 0 && owner == pid)
            return trackedWindow;
        try {
            using Process app = Process.GetProcessById(pid);
            trackedWindow = app.MainWindowHandle;
            return trackedWindow;
        } catch (ArgumentException) { return IntPtr.Zero; }
    }

    public static object ReadWindow(int pid) {
        IntPtr window = MainWindow(pid);
        return new {
            state = window == IntPtr.Zero ? "missing" : IsIconic(window) ? "minimized" :
                IsWindowVisible(window) ? "visible" : "hidden",
            foreground = window != IntPtr.Zero && GetForegroundWindow() == window
        };
    }

    public static object ChangeWindow(int pid, string action) {
        IntPtr window = MainWindow(pid);
        if (window == IntPtr.Zero) throw new InvalidOperationException("The profiled process has no main window.");
        if (action == "close") {
            if (!PostMessageW(window, 0x0010, UIntPtr.Zero, IntPtr.Zero))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return ReadWindow(pid);
        }
        bool minimize = action == "minimize";
        if (IsIconic(window) != minimize && !ShowWindowAsync(window, minimize ? 7 : 9))
            throw new InvalidOperationException("The window state command failed.");
        for (int attempt = 0; attempt < 100 && IsIconic(window) != minimize; ++attempt) Thread.Sleep(20);
        if (IsIconic(window) != minimize) throw new InvalidOperationException("The window did not reach the requested state.");
        return ReadWindow(pid);
    }
}
"@

$clock = [Diagnostics.Stopwatch]::StartNew()
[Console]::Out.WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::In.ReadLine())) {
    $id = $null
    try {
        $request = $line | ConvertFrom-Json
        $id = $request.id
        $pidToObserve = [int]$request.pid
        switch ($request.action) {
            'sample' {
                $start = $clock.Elapsed.TotalMilliseconds
                $tree = [DarsWindowsMetrics]::ReadTree($pidToObserve)
                $system = [DarsWindowsMetrics]::ReadSystem()
                $window = [DarsWindowsMetrics]::ReadWindow($pidToObserve)
                $end = $clock.Elapsed.TotalMilliseconds
                $response = @{ timeMs = ($start + $end) / 2; captureMs = $end - $start; tree = $tree; system = $system; window = $window }
            }
            { $_ -in @('minimize', 'restore', 'close') } {
                $response = [DarsWindowsMetrics]::ChangeWindow($pidToObserve, $_)
            }
            default { throw 'Unsupported sampler command.' }
        }
        [Console]::Out.WriteLine((@{ id = $id; result = $response } | ConvertTo-Json -Compress -Depth 7))
    } catch {
        [Console]::Out.WriteLine((@{ id = $id; error = $_.Exception.GetBaseException().Message } | ConvertTo-Json -Compress))
    }
}
