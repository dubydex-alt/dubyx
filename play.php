<?php
$conn = new mysqli('sql301.infinityfree.com', 'if0_41158662', 'D2UQHHFoBdbafCp', 'if0_41158662_backendxtra9');

session_start();
require_once 'common/config.php';

if (!isset($_SESSION['user_id']) && !isset($_SESSION['teacher_id'])) {
    header('Location: /login.php');
    exit;
}

$video_id = (int) ($_GET['video_id'] ?? 0);
$live_id = (int) ($_GET['live_id'] ?? 0);

if ($video_id <= 0 && $live_id <= 0) {
    header('Location: /mycourses.php');
    exit;
}

$video = null;
$course_id = 0;

if ($live_id > 0) {
    $stmt = $conn->prepare("SELECT ls.*, c.id as course_id, c.title as course_title FROM live_sessions ls JOIN courses c ON ls.course_id = c.id WHERE ls.id = ?");
    $stmt->bind_param("i", $live_id);
    $stmt->execute();
    $video = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$video) {
        header('Location: /mycourses.php');
        exit;
    }
    $video['type'] = 'youtube'; // Live always YouTube in this implementation
    $video['chapter_title'] = 'Live Session'; // Default for live sessions
    $course_id = $video['course_id'];
} else {
    // Fetch video details
    $stmt = $conn->prepare("SELECT v.*, c.id as course_id, c.title as course_title, ch.title as chapter_title
                            FROM videos v
                            JOIN chapters ch ON v.chapter_id = ch.id
                            JOIN courses c ON ch.course_id = c.id
                            WHERE v.id = ?");
    $stmt->bind_param("i", $video_id);
    $stmt->execute();
    $video = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$video) {
        header('Location: /mycourses.php');
        exit;
    }
    $course_id = $video['course_id'];

    // Exam Mode Logic
    $exam_status = 'not_exam';
    $server_time = time();
    $start_ts = 0;
    $end_ts = 0;

    if ($video['is_test']) {
        $start_ts = strtotime($video['start_time']);
        $end_ts = strtotime($video['end_time']);

        if ($server_time < $start_ts) {
            $exam_status = 'scheduled';
        } elseif ($server_time > $end_ts) {
            $exam_status = 'ended';
        } else {
            $exam_status = 'live';
        }
    }

    // Violation Check
    $violation = null;
    if ($video['is_test']) {
        $v_stmt = $conn->prepare("SELECT reason FROM exam_violations WHERE user_id = ? AND video_id = ?");
        $v_stmt->bind_param("ii", $_SESSION['user_id'], $video_id);
        $v_stmt->execute();
        $violation = $v_stmt->get_result()->fetch_assoc();
        $v_stmt->close();

        if ($violation) {
            $exam_status = 'failed';
        }
    }
}

// Fetch course owner info for permission check
$owner_stmt = $conn->prepare("SELECT c.teacher_id, t.features FROM courses c LEFT JOIN teachers t ON c.teacher_id = t.id WHERE c.id = ?");
$owner_stmt->bind_param("i", $course_id);
$owner_stmt->execute();
$owner_info = $owner_stmt->get_result()->fetch_assoc();
$owner_stmt->close();

$show_discussion = true; // Default
if ($owner_info && $owner_info['teacher_id']) {
    $owner_features = json_decode($owner_info['features'] ?? '[]', true);
    if (!in_array('community', $owner_features)) {
        $show_discussion = false;
    }
}


// Check access
$access = false;
if (isset($_SESSION['user_id'])) {
    $stmt = $conn->prepare("SELECT id FROM orders WHERE user_id = ? AND course_id = ? AND status = 'success'");
    $stmt->bind_param("ii", $_SESSION['user_id'], $course_id);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        $access = true;
    }
    $stmt->close();
}

// Teachers always have access to their own courses / sessions
if (isset($_SESSION['teacher_id']) && $owner_info && $owner_info['teacher_id'] == $_SESSION['teacher_id']) {
    $access = true;
}

if (!$access) {
    header('Location: /course_details.php?id=' . $course_id);
    exit;
}

// Extract YouTube ID for Plyr
$yt_id = '';
if ($video['type'] === 'youtube') {
    if (preg_match('/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/', $video['url'], $matches)) {
        $yt_id = $matches[1];
    }
}

function get_gdrive_embed($url)
{
    if (preg_match('/d\/([a-zA-Z0-9_-]+)/', $url, $matches)) {
        return "https://drive.google.com/file/d/" . $matches[1] . "/preview";
    }
    return $url;
}

$page_title = "Playing: " . $video['title'];
include 'common/header.php';
?>

<!-- Plyr CSS -->
<link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css" />

<style>
    /* Styling for the Whitelabel Player */
    .plyr--youtube.plyr--video .plyr__video-wrapper iframe {
        top: -50%;
        height: 200%;
        /* Hide the top/bottom black bars and some UI */
    }

    .plyr--full-ui.plyr--video .plyr__control--overlaid {
        background: var(--primary-color, #2563eb);
    }

    .plyr--full-ui.plyr--video .plyr__control:hover {
        background: var(--primary-color, #2563eb);
    }

    /* Masking YouTube sensitive areas */
    .player-container {
        position: relative;
    }

    .yt-mask-top {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        z-index: 10;
        background: transparent;
        /* Blocks interaction with channel links */
    }

    /* GDrive Full Page Mode */
    .gdrive-container {
        height: 85vh;
        width: 100%;
        background: #f1f1f1;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    }

    /* Live Chat Styles */
    #chat-box::-webkit-scrollbar {
        width: 4px;
    }

    #chat-box::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 10px;
    }

    /* Sending Progress Bar */
    #sending-indicator {
        height: 2px;
        width: 0%;
        background: #0284c7;
        transition: width 0.3s ease;
    }

    /* Teacher Highlighted Comment */
    .comment-teacher {
        background: #f0f9ff !important;
        border: 1px solid #bae6fd !important;
    }

    .comment-teacher .user-label {
        color: #0369a1 !important;
    }

    /* Exam Mode UI */
    #exam-top-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 99999;
        background: #ef4444;
        color: white;
        padding: 0.75rem 1.5rem;
        display: none;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }

    #timer-val {
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        letter-spacing: 2px;
        font-size: 1.25rem;
    }

    .exam-fullscreen-prompt {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at center, #1e293b, #0f172a);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        text-align: center;
        padding: 2rem;
    }

    .anti-cheat-warning {
        position: fixed;
        top: 4rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: #fca5a5;
        padding: 1rem 2rem;
        border-radius: 1rem;
        border: 2px solid #ef4444;
        z-index: 100000;
        font-weight: bold;
        display: none;
        animation: shake 0.5s ease-in-out infinite;
    }

    @keyframes shake {

        0%,
        100% {
            transform: translate(-50%, 0);
        }

        25% {
            transform: translate(-52%, 0);
        }

        75% {
            transform: translate(-48%, 0);
        }
    }
</style>

<div id="exam-top-bar">
    <div class="max-w-6xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-3">
            <span class="bg-white/20 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">Live
                Exam</span>
            <span class="font-bold text-sm truncate max-w-[200px]"><?php echo clean($video['title']); ?></span>
        </div>
        <div class="flex items-center gap-4">
            <div class="flex flex-col items-end leading-none">
                <span class="text-[9px] font-bold opacity-70 uppercase tracking-tighter">Time Remaining</span>
                <span id="timer-val" class="font-black">00:00:00</span>
            </div>
        </div>
    </div>
</div>

<div id="cheat-warning" class="anti-cheat-warning">
    <i class="fas fa-exclamation-triangle mr-2"></i> SECURITY ALERT: TAB SWITCH DETECTED!
</div>

<main class="bg-gray-900 min-h-screen pb-12">
    <div class="max-w-6xl mx-auto">
        <!-- Back Link -->
        <div class="p-4">
            <a href="/watch.php?course_id=<?php echo $course_id; ?>"
                class="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium">
                <i class="fas fa-chevron-left"></i>
                Back to Curriculum
            </a>
        </div>

        <!-- content area -->
        <div class="px-4">
            <?php if ($exam_status === 'scheduled'): ?>
                <div class="bg-gray-800 rounded-2xl p-20 text-center border border-white/10">
                    <div
                        class="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-calendar-alt text-2xl"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-white mb-2">Exam Scheduled</h2>
                    <p class="text-gray-400 mb-6">This test will be available at
                        <strong><?php echo date('d M Y, h:i A', strtotime($video['start_time'])); ?></strong>.
                    </p>
                    <div
                        class="inline-block px-4 py-2 bg-white/5 rounded-lg text-xs font-bold text-gray-300 uppercase tracking-widest">
                        Wait for the start time
                    </div>
                </div>
            <?php elseif ($exam_status === 'failed'): ?>
                <div class="bg-gray-800 rounded-2xl p-20 text-center border border-red-500/30">
                    <div
                        class="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-user-slash text-2xl"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-white mb-2">Access Blocked</h2>
                    <p class="text-gray-400 mb-6 font-medium">Your access to this test has been permanently revoked due to
                        security violations detected in a previous session.</p>
                    <div class="text-xs bg-red-500/10 text-red-400 p-3 rounded-lg border border-red-500/20 inline-block">
                        Reason: <?php echo clean($violation['reason']); ?>
                    </div>
                    <div class="mt-8">
                        <a href="/watch.php?course_id=<?php echo $course_id; ?>"
                            class="bg-primary text-white px-8 py-3 rounded-xl font-bold">Return to Curriculum</a>
                    </div>
                </div>
            <?php elseif ($exam_status === 'ended'): ?>
                <div class="bg-gray-800 rounded-2xl p-20 text-center border border-white/10">
                    <div
                        class="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-hourglass-end text-2xl"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-white mb-2">Exam Duration Ended</h2>
                    <p class="text-gray-400 mb-6">The submission window for this test has closed.</p>
                    <a href="/watch.php?course_id=<?php echo $course_id; ?>"
                        class="bg-primary text-white px-8 py-3 rounded-xl font-bold">Back to Lessons</a>
                </div>
            <?php elseif ($video['type'] === 'youtube'): ?>
                <div class="player-container shadow-2xl rounded-xl overflow-hidden bg-black">
                    <div class="yt-mask-top"></div>
                    <div id="player" data-plyr-provider="youtube" data-plyr-embed-id="<?php echo $yt_id; ?>"></div>
                </div>
            <?php else: ?>
                <?php if ($video['is_test']): ?>
                    <div id="exam-prompt" class="exam-fullscreen-prompt">
                        <i class="fas fa-shield-alt text-6xl text-primary mb-6"></i>
                        <h2 class="text-3xl font-bold mb-4 uppercase tracking-tighter">EXAM SECURITY RULES</h2>

                        <div class="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 max-w-lg text-left">
                            <ul class="space-y-3 text-sm text-gray-300">
                                <li class="flex items-start gap-3">
                                    <i class="fas fa-check-circle text-green-500 mt-1"></i>
                                    <span><strong>Fullscreen Required</strong>: Exiting fullscreen will terminate the
                                        exam.</span>
                                </li>
                                <li class="flex items-start gap-3">
                                    <i class="fas fa-check-circle text-green-500 mt-1"></i>
                                    <span><strong>Stay Focused</strong>: Switching tabs or applications will cause instant
                                        failure.</span>
                                </li>
                                <li class="flex items-start gap-3">
                                    <i class="fas fa-check-circle text-green-500 mt-1"></i>
                                    <span><strong>Navigation Blocked</strong>: Refreshing or going back will be recorded as
                                        cheating.</span>
                                </li>
                                <li class="flex items-start gap-3">
                                    <i class="fas fa-check-circle text-green-500 mt-1"></i>
                                    <span><strong>Proctoring</strong>: Your activity is being monitored and recorded.</span>
                                </li>
                            </ul>
                        </div>

                        <p class="text-gray-400 max-w-md mb-8 italic text-sm">By clicking the button below, you agree to follow
                            these rules. Any violation will result in permanent loss of access.</p>

                        <button onclick="startExam()"
                            class="bg-primary hover:bg-primary-dark text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/30 transition-all hover:scale-105">
                            I AGREE & START TEST
                        </button>
                    </div>
                <?php endif; ?>
                <div class="gdrive-container" id="content-iframe-container">
                    <iframe id="exam-iframe"
                        src="<?php echo ($video['is_test']) ? 'about:blank' : (($video['type'] === 'gdrive' ? get_gdrive_embed($video['url']) : $video['url'])); ?>"
                        class="w-full h-full" frameborder="0"></iframe>
                </div>
            <?php endif; ?>

            <!-- Info Area -->
            <div class="mt-8 bg-gray-800/50 p-6 rounded-xl border border-white/5">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div
                            class="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest mb-2">
                            <i class="fas fa-folder-open"></i> <?php echo clean($video['chapter_title']); ?>
                        </div>
                        <h1 class="text-2xl md:text-3xl font-bold text-white tracking-tight">
                            <?php echo clean($video['title']); ?>
                        </h1>
                        <p class="text-gray-400 mt-2 text-sm max-w-2xl">
                            Watching this lesson from <strong><?php echo clean($video['course_title']); ?></strong>.
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
                        <?php if ($video['type'] === 'youtube'): ?>
                            <div class="flex flex-col items-end">
                                <span
                                    class="bg-primary/10 text-primary px-4 py-2 rounded-lg text-xs font-black border border-primary/20 flex items-center gap-2">
                                    <i class="fas fa-video"></i> VIDEO LESSON
                                </span>
                            </div>
                        <?php else: ?>
                            <div class="flex flex-col items-end">
                                <span
                                    class="bg-gray-500/10 text-gray-500 px-4 py-2 rounded-lg text-xs font-black border border-gray-500/20 flex items-center gap-2">
                                    <i class="fas fa-file-alt"></i> DOCUMENT VIEW
                                </span>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <?php if ($show_discussion && $live_id > 0 && $video['status'] === 'live'): ?>
        <!-- Internal Live Chat Section -->
        <div class="max-w-6xl mx-auto px-4 mt-8">
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 class="font-black text-gray-900 text-sm flex items-center gap-2">
                        <i class="fas fa-satellite-dish text-red-500 animate-pulse"></i> LIVE CHAT
                    </h3>
                    <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Real-time interaction
                    </div>
                </div>

                <div id="chat-box" class="h-[400px] overflow-y-auto p-6 space-y-4 bg-white flex flex-col">
                    <!-- Comments load here -->
                    <div class="text-center text-gray-400 text-xs py-20 italic">
                        Welcome to the live session! Say hello...
                    </div>
                </div>

                <div id="sending-indicator"></div>
                <div class="p-4 bg-gray-50 border-t border-gray-200">
                    <form id="chat-form" class="flex gap-2" data-no-loader>
                        <input type="text" id="chat-input" placeholder="Type your message..." required
                            class="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary">
                        <button type="submit" id="chat-send-btn"
                            class="bg-primary text-white p-2 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-primary-dark transition-colors">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <script>
            let lastCommentId = 0;
            let firstCommentId = 0;
            let isLoadingOlder = false;
            let hasMoreOlder = true;
            const liveId = <?php echo $live_id; ?>;
            const isTeacher = <?php echo isset($_SESSION['teacher_id']) ? 'true' : 'false'; ?>;
            const chatBox = document.getElementById('chat-box');
            const chatForm = document.getElementById('chat-form');
            const chatInput = document.getElementById('chat-input');
            const sendingIndicator = document.getElementById('sending-indicator');

            function createCommentEl(c, isOptimistic = false) {
                const div = document.createElement('div');
                let classes = 'rounded-2xl px-4 py-2 max-w-[85%] self-start border flex flex-col ';

                if (c.is_teacher) {
                    classes += 'comment-teacher border-blue-100 ';
                } else {
                    classes += 'bg-gray-50 border-gray-100 ';
                }

                if (isOptimistic) classes += 'opacity-50 ';
                div.className = classes;

                if (isOptimistic) div.id = 'optimistic-' + Date.now();

                let blockBtn = '';
                if (isTeacher && c.user_id) {
                    blockBtn = `<button onclick="toggleBlock(this, ${c.user_id}, ${!c.is_blocked})" class="ml-2 text-[8px] font-black uppercase tracking-widest ${c.is_blocked ? 'text-green-600' : 'text-red-600'} hover:underline">
                        ${c.is_blocked ? 'Unblock' : 'Block'}
                    </button>`;
                }

                div.innerHTML = `
                    <div class="flex items-center justify-between gap-4 mb-1">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] font-black ${c.is_teacher ? 'text-blue-700' : 'text-primary'} uppercase user-label">${c.user}</span>
                            <span class="text-[8px] text-gray-400">${c.time}</span>
                        </div>
                        ${blockBtn}
                    </div>
                    <p class="text-sm text-gray-700 leading-relaxed">${c.message}</p>
                `;
                return div;
            }

            function toggleBlock(btn, uid, block) {
                if (!confirm(block ? 'Block this student from commenting?' : 'Unblock this student?')) return;

                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                const data = new FormData();
                data.append('action', 'block');
                data.append('live_id', liveId);
                data.append('user_id', uid);
                data.append('block', block);
                fetch('/api/comments.php', { method: 'POST', body: data })
                    .then(r => r.json())
                    .then(res => {
                        if (res.success) {
                            const newBlockStatus = block;
                            btn.textContent = newBlockStatus ? 'Unblock' : 'Block';
                            btn.className = `ml-2 text-[8px] font-black uppercase tracking-widest ${newBlockStatus ? 'text-green-600' : 'text-red-600'} hover:underline`;
                            btn.onclick = () => toggleBlock(btn, uid, !newBlockStatus);
                            btn.disabled = false;
                        } else {
                            alert(res.message);
                            fetchComments();
                        }
                    });
            }

            function fetchComments() {
                fetch(`/api/comments.php?action=fetch&live_id=${liveId}&last_id=${lastCommentId}`)
                    .then(r => r.json())
                    .then(res => {
                        if (res.success && res.comments.length > 0) {
                            const wasAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 50;

                            res.comments.forEach(c => {
                                // Remove optimistic if exists
                                const opt = document.querySelector(`[data-msg="${btoa(c.message)}"]`);
                                if (opt) opt.remove();

                                chatBox.appendChild(createCommentEl(c));
                                lastCommentId = c.id;
                                if (firstCommentId === 0) firstCommentId = c.id;
                            });

                            if (wasAtBottom) chatBox.scrollTop = chatBox.scrollHeight;
                        }
                    });
            }

            function loadOlderComments() {
                if (isLoadingOlder || !hasMoreOlder || firstCommentId === 0) return;
                isLoadingOlder = true;

                const oldHeight = chatBox.scrollHeight;

                fetch(`/api/comments.php?action=load_older&live_id=${liveId}&before_id=${firstCommentId}`)
                    .then(r => r.json())
                    .then(res => {
                        if (res.success) {
                            if (res.comments.length === 0) {
                                hasMoreOlder = false;
                            } else {
                                res.comments.reverse().forEach(c => {
                                    chatBox.prepend(createCommentEl(c));
                                    firstCommentId = c.id;
                                });
                                // Keep scroll position
                                chatBox.scrollTop = chatBox.scrollHeight - oldHeight;
                            }
                        }
                        isLoadingOlder = false;
                    });
            }

            // Scroll listener for "Load More"
            chatBox.onscroll = () => {
                if (chatBox.scrollTop === 0) loadOlderComments();
            };

            chatForm.onsubmit = (e) => {
                e.preventDefault();
                const msg = chatInput.value.trim();
                if (!msg) return;

                // Optimistic UI
                const tempC = { user: 'You', message: msg, time: new Date().getHours() + ':' + new Date().getMinutes() };
                const tempEl = createCommentEl(tempC, true);
                tempEl.setAttribute('data-msg', btoa(msg));
                chatBox.appendChild(tempEl);
                chatBox.scrollTop = chatBox.scrollHeight;

                sendingIndicator.style.width = '30%';

                const data = new FormData();
                data.append('action', 'post');
                data.append('live_id', liveId);
                data.append('message', msg);

                chatInput.value = '';
                fetch('/api/comments.php', { method: 'POST', body: data })
                    .then(r => r.json())
                    .then(res => {
                        sendingIndicator.style.width = '100%';
                        setTimeout(() => sendingIndicator.style.width = '0%', 500);
                        if (!res.success) {
                            alert(res.message);
                            tempEl.remove();
                        }
                        fetchComments();
                    });
            };

            // Initial fetch
            fetchComments();
            // Poll every 3 seconds
            setInterval(fetchComments, 3000);
        </script>
    <?php elseif ($live_id > 0 && $video['status'] === 'ended'): ?>
        <div class="max-w-6xl mx-auto px-4 mt-8">
            <div class="bg-gray-100 rounded-2xl p-12 text-center border border-gray-200">
                <i class="fas fa-history text-4xl text-gray-300 mb-4"></i>
                <h3 class="font-bold text-gray-900">Session Ended</h3>
                <p class="text-sm text-gray-500 mt-2">The live chat has been closed and cleared.</p>
            </div>
        </div>
    <?php endif; ?>
</main>

<!-- Plyr JS -->
<script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script>
<script>
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('player')) {
            const player = new Plyr('#player', {
                controls: [
                    'play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
                ],
                youtube: {
                    noCookie: true,
                    rel: 0,
                    showinfo: 0,
                    iv_load_policy: 3,
                    modestbranding: 1,
                    autoplay: 1
                },
                keyboard: { focused: true, global: true },
                tooltips: { controls: true, seek: true }
            });

            // Restrict external links
            player.on('ready', (event) => {
                const iframe = event.detail.plyr.elements.wrapper.querySelector('iframe');
                if (iframe) {
                    iframe.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-presentation');
                    // Note: sandbox might break some YouTube features, but it's an extra layer of privacy.
                    // If it breaks playback, remove 'sandbox' attribute.
                }
            });
        }
    });

    // Disable Right Click
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Exam Mode Logic
    <?php if ($video['is_test'] && $exam_status === 'live'): ?>
        const serverTimeAtLoad = <?php echo $server_time; ?> * 1000;
        const localTimeAtLoad = new Date().getTime();
        const serverOffset = serverTimeAtLoad - localTimeAtLoad;

        const endTime = <?php echo $end_ts; ?> * 1000;
        let examStarted = false;

        function startExam() {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => {
                    console.log("Fullscreen request failed");
                });
            }

            document.getElementById('exam-prompt').style.display = 'none';
            document.getElementById('exam-top-bar').style.display = 'block';

            // Isolate UI: Hide header, footer, bottom nav, and info areas
            document.querySelector('header')?.style.setProperty('display', 'none', 'important');
            document.querySelector('footer')?.style.setProperty('display', 'none', 'important');
            document.querySelector('nav.fixed.bottom-0')?.style.setProperty('display', 'none', 'important'); // Bottom Nav
            document.querySelector('main > div > div:first-child')?.style.setProperty('display', 'none', 'important'); // Back link
            document.querySelector('.mt-8.bg-gray-800\\/50')?.style.setProperty('display', 'none', 'important'); // Info Area
            document.querySelector('main')?.classList.remove('pb-12');
            document.querySelector('main')?.classList.add('pt-12'); // Space for top bar

            // Load test URL only now
            const testUrl = "<?php echo ($video['type'] === 'gdrive') ? get_gdrive_embed($video['url']) : $video['url']; ?>";
            document.getElementById('exam-iframe').src = testUrl;

            examStarted = true;

            // Anti-cheat measures
            initAntiCheat();
            startTimer();
        }

        function initAntiCheat() {
            // Tab switching detection
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && examStarted) {
                    showWarning("TAB SWITCH DETECTED! This activity is being recorded.");
                }
            });

            // Focus detection - ignored if focused on IFRAME (using timeout to let activeElement update)
            window.onblur = () => {
                if (!examStarted) return;
                setTimeout(() => {
                    if (document.activeElement === document.getElementById('exam-iframe')) {
                        return; // User clicked inside the exam
                    }
                    if (examStarted) showWarning("WINDOW FOCUS LOST! Stay on this screen.");
                }, 200);
            }

            // Key blocking
            document.addEventListener('keydown', e => {
                // Block Ctrl+C, Ctrl+V, Ctrl+P, Ctrl+U, F12, PrntScrn, Ctrl+Shift+I, Ctrl+S
                if (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'p' || e.key === 'u' || e.key === 's')) {
                    e.preventDefault();
                    showWarning("Action Restricted!");
                }
                if (e.ctrlKey && e.shiftKey && e.key === 'I') e.preventDefault();
                if (e.key === 'F12' || e.key === 'PrintScreen') e.preventDefault();
            });

            // Fullscreen enforcement
            document.addEventListener('fullscreenchange', () => {
                if (!document.fullscreenElement && examStarted) {
                    showWarning("FULLSCREEN EXITED! Please re-enter to continue.");
                }
            });

            // Navigation blocking
            window.onbeforeunload = (e) => {
                if (examStarted) {
                    // Log violation before they actually leave
                    const data = new FormData();
                    data.append('action', 'log_security');
                    data.append('video_id', '<?php echo $video_id; ?>');
                    data.append('detail', "NAVIGATION ATTEMPT: Student tried to refresh, go back, or close the page.");
                    navigator.sendBeacon('/api/security_log.php', data);

                    e.preventDefault();
                    e.returnValue = ''; // Standard for modern browsers
                    return "Warning: Leaving this page will FAIL your exam!";
                }
            };

            // Prevent text selection
            document.body.style.userSelect = 'none';
        }

        function showWarning(msg) {
            // Instant termination on violation
            const data = new FormData();
            data.append('action', 'log_security');
            data.append('video_id', '<?php echo $video_id; ?>');
            data.append('detail', msg);
            fetch('/api/security_log.php', {
                method: 'POST',
                body: data
            }).then(() => {
                forceCloseExam(msg);
            });
        }

        function startTimer() {
            const timerVal = document.getElementById('timer-val');
            const topBar = document.getElementById('exam-top-bar');

            const tick = setInterval(() => {
                const now = new Date().getTime() + serverOffset;
                const distance = endTime - now;

                if (distance < 0) {
                    clearInterval(tick);
                    timerVal.innerHTML = "EXPIRED";
                    forceCloseExam();
                    return;
                }

                const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((distance % (1000 * 60)) / 1000);

                timerVal.innerHTML =
                    (h < 10 ? '0' + h : h) + ":" +
                    (m < 10 ? '0' + m : m) + ":" +
                    (s < 10 ? '0' + s : s);

                // Warning color
                if (distance < 300000) { // 5 mins
                    topBar.style.background = '#f97316';
                }
                if (distance < 60000) { // 1 min
                    topBar.classList.add('animate-pulse');
                    topBar.style.background = '#dc2626';
                }
            }, 1000);
        }

        function forceCloseExam(violationMsg = null) {
            const container = document.getElementById('content-iframe-container');
            const isViolation = (violationMsg !== null);

            container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full bg-gray-900 text-white rounded-xl border ${isViolation ? 'border-red-500' : 'border-white/10'} p-12">
                <div class="w-24 h-24 ${isViolation ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'} rounded-full flex items-center justify-center mb-6">
                    <i class="fas ${isViolation ? 'fa-user-slash' : 'fa-check-circle'} text-4xl"></i>
                </div>
                <h2 class="text-3xl font-black uppercase tracking-tighter">${isViolation ? 'Exam Terminated' : 'Exam Submitted Successfully'}</h2>
                <p class="text-gray-400 mt-2 text-center max-w-sm">
                    ${isViolation ? 'Security violation detected: ' + violationMsg + '. Your attempt has been recorded as a failure and access is blocked.' : 'Your test session has ended and access is now closed. You may return to the course curriculum.'}
                </p>
                <a href="/watch.php?course_id=<?php echo $course_id; ?>" class="mt-8 bg-primary hover:bg-primary-dark text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/30 transition-all">
                    Return to Curriculum
                </a>
            </div>
        `;

            if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
            examStarted = false;
            window.onbeforeunload = null; // Remove navigation block
            document.getElementById('exam-top-bar').style.display = 'none';
            document.body.style.userSelect = 'auto';
        }
    <?php endif; ?>
</script>

<?php include 'common/bottom.php'; ?>