<?php
/**
 * fix_db_schema.php  —  SkillzUp Unified Database Schema Fixer
 * ═══════════════════════════════════════════════════════════════
 * Consolidates ALL migrations (install.php + db_*.php + migrate_*.php)
 * into a single idempotent script.  Safe to run multiple times.
 *
 * Usage: visit /fix_db_schema.php in a browser or run via CLI.
 */

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once 'common/config.php';

if (!isset($conn) || $conn->connect_error) {
    die('<h2 style="color:red">Database connection failed.</h2>');
}
$conn->set_charset('utf8mb4');

$log = [];

// ── helpers ──────────────────────────────────────────────────
function run($conn, $sql, $desc = '')
{
    global $log;
    if ($conn->query($sql)) {
        $log[] = ['ok', $desc ?: substr($sql, 0, 100)];
    } else {
        $log[] = ['err', ($desc ?: substr($sql, 0, 100)) . ' — ' . $conn->error];
    }
}

function col_exists($conn, $table, $column)
{
    $check = $conn->query("SHOW COLUMNS FROM `$table` LIKE '$column'");
    return ($check && $check->num_rows > 0);
}

function add_col_if_missing($conn, $table, $column, $sql)
{
    global $log;
    if (!col_exists($conn, $table, $column)) {
        run($conn, $sql, "Add column '$column' to '$table'");
    } else {
        $log[] = ['skip', "Column '$column' already exists in '$table'"];
    }
}

// ═════════════════════════════════════════════════════════════
//  1. SETTINGS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `settings` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `app_name`           VARCHAR(150) NOT NULL DEFAULT 'SkillzUp',
  `razorpay_key`       VARCHAR(255) DEFAULT NULL,
  `razorpay_secret`    VARCHAR(255) DEFAULT NULL,
  `support_email`      VARCHAR(150) DEFAULT NULL,
  `support_phone`      VARCHAR(50)  DEFAULT NULL,
  `onesignal_app_id`   VARCHAR(255) DEFAULT NULL,
  `onesignal_rest_key` VARCHAR(255) DEFAULT NULL,
  `community_url`      VARCHAR(500) DEFAULT NULL,
  `updated_at`         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB", "Create 'settings' table");

run($conn, "INSERT IGNORE INTO `settings` (`id`, `app_name`) VALUES (1, 'SkillzUp')", "Default settings row");

// settings – add missing columns
add_col_if_missing($conn, 'settings', 'onesignal_app_id',  "ALTER TABLE `settings` ADD COLUMN `onesignal_app_id`  VARCHAR(255) DEFAULT NULL");
add_col_if_missing($conn, 'settings', 'onesignal_rest_key',"ALTER TABLE `settings` ADD COLUMN `onesignal_rest_key` VARCHAR(255) DEFAULT NULL");
add_col_if_missing($conn, 'settings', 'community_url',     "ALTER TABLE `settings` ADD COLUMN `community_url`     VARCHAR(500) DEFAULT NULL");

// ═════════════════════════════════════════════════════════════
//  2. ADMIN TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `admin` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `username`   VARCHAR(100) NOT NULL UNIQUE,
  `password`   VARCHAR(255) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB", "Create 'admin' table");

$check_admin = $conn->query("SELECT id FROM admin LIMIT 1");
if ($check_admin && $check_admin->num_rows == 0) {
    $hashed = password_hash('admin123', PASSWORD_DEFAULT);
    run($conn, "INSERT INTO admin (username, password) VALUES ('admin', '$hashed')", "Default admin user (admin/admin123)");
}

// ═════════════════════════════════════════════════════════════
//  3. TEACHERS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `teachers` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id_str` VARCHAR(50)  NOT NULL UNIQUE,
  `name`           VARCHAR(150) NOT NULL,
  `email`          VARCHAR(150) NOT NULL UNIQUE,
  `password`       VARCHAR(255) NOT NULL,
  `qr_code`        VARCHAR(255) DEFAULT NULL,
  `logo`           VARCHAR(255) DEFAULT NULL,
  `features`       TEXT DEFAULT NULL,
  `settings`       TEXT DEFAULT NULL,
  `status`         ENUM('active','blocked') DEFAULT 'active',
  `session_token`  VARCHAR(128) DEFAULT NULL,
  `created_at`     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher_id_str` (`teacher_id_str`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB", "Create 'teachers' table");

add_col_if_missing($conn, 'teachers', 'settings',      "ALTER TABLE `teachers` ADD COLUMN `settings`      TEXT DEFAULT NULL AFTER `features`");
add_col_if_missing($conn, 'teachers', 'session_token',  "ALTER TABLE `teachers` ADD COLUMN `session_token` VARCHAR(128) DEFAULT NULL AFTER `settings`");

// ═════════════════════════════════════════════════════════════
//  4. USERS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `users` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id`      INT DEFAULT NULL,
  `name`            VARCHAR(150) NOT NULL,
  `phone`           VARCHAR(30) DEFAULT NULL,
  `email`           VARCHAR(150) NOT NULL UNIQUE,
  `password`        VARCHAR(255) NOT NULL,
  `onesignal_id`    VARCHAR(255) DEFAULT NULL,
  `session_token`   VARCHAR(128) DEFAULT NULL,
  `remember_token`  VARCHAR(128) DEFAULT NULL,
  `status`          ENUM('active','blocked') DEFAULT 'active',
  `forum_blocked`   TINYINT(1) DEFAULT 0,
  `deleted_at`      DATETIME DEFAULT NULL,
  `created_at`      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_email`   (`email`)
) ENGINE=InnoDB", "Create 'users' table");

add_col_if_missing($conn, 'users', 'teacher_id',      "ALTER TABLE `users` ADD COLUMN `teacher_id`      INT DEFAULT NULL AFTER `id`");
add_col_if_missing($conn, 'users', 'onesignal_id',    "ALTER TABLE `users` ADD COLUMN `onesignal_id`    VARCHAR(255) DEFAULT NULL AFTER `email`");
add_col_if_missing($conn, 'users', 'session_token',   "ALTER TABLE `users` ADD COLUMN `session_token`   VARCHAR(128) DEFAULT NULL AFTER `onesignal_id`");
add_col_if_missing($conn, 'users', 'remember_token',  "ALTER TABLE `users` ADD COLUMN `remember_token`  VARCHAR(128) DEFAULT NULL AFTER `session_token`");
add_col_if_missing($conn, 'users', 'forum_blocked',   "ALTER TABLE `users` ADD COLUMN `forum_blocked`   TINYINT(1) DEFAULT 0 AFTER `status`");
add_col_if_missing($conn, 'users', 'deleted_at',      "ALTER TABLE `users` ADD COLUMN `deleted_at`      DATETIME DEFAULT NULL AFTER `forum_blocked`");

// Make user_id nullable in activity_logs (safe to re-run)
run($conn, "ALTER TABLE `activity_logs` MODIFY COLUMN `user_id` INT DEFAULT NULL", "Make 'user_id' nullable in 'activity_logs'");

// ═════════════════════════════════════════════════════════════
//  5. LOGIN ATTEMPTS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `email`        VARCHAR(150) NOT NULL,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_email_time` (`email`, `attempted_at`)
) ENGINE=InnoDB", "Create 'login_attempts' table");

// ═════════════════════════════════════════════════════════════
//  6. ACTIVITY LOGS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT DEFAULT NULL,
  `action`     VARCHAR(500) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB", "Create 'activity_logs' table");

// ═════════════════════════════════════════════════════════════
//  7. CATEGORIES TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `categories` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id` INT DEFAULT NULL,
  `name`       VARCHAR(150) NOT NULL,
  `icon`       VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'categories' table");

// ═════════════════════════════════════════════════════════════
//  8. COUPONS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `coupons` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id`       INT DEFAULT NULL,
  `code`             VARCHAR(50) NOT NULL UNIQUE,
  `discount_percent` INT NOT NULL,
  `expiry_date`      DATE NOT NULL,
  `status`           ENUM('active','inactive') DEFAULT 'active',
  `created_at`       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_code`    (`code`),
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'coupons' table");

// ═════════════════════════════════════════════════════════════
//  9. BANNERS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `banners` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id` INT DEFAULT NULL,
  `title`      VARCHAR(255) DEFAULT NULL,
  `image`      VARCHAR(255) NOT NULL,
  `link`       VARCHAR(500) DEFAULT NULL,
  `sort_order` INT DEFAULT 0,
  `is_active`  TINYINT(1) DEFAULT 1,
  `status`     ENUM('active','blocked') DEFAULT 'active',
  `deleted_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_status`  (`status`)
) ENGINE=InnoDB", "Create 'banners' table");

add_col_if_missing($conn, 'banners', 'status',     "ALTER TABLE `banners` ADD COLUMN `status`     ENUM('active','blocked') DEFAULT 'active' AFTER `is_active`");
add_col_if_missing($conn, 'banners', 'deleted_at',  "ALTER TABLE `banners` ADD COLUMN `deleted_at` DATETIME DEFAULT NULL AFTER `status`");

// ═════════════════════════════════════════════════════════════
//  10. COURSES TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `courses` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id`       INT DEFAULT NULL,
  `category_id`      INT DEFAULT NULL,
  `title`            VARCHAR(255) NOT NULL,
  `description`      TEXT DEFAULT NULL,
  `meta_description` TEXT DEFAULT NULL,
  `image`            VARCHAR(255) DEFAULT NULL,
  `mrp`              DECIMAL(10,2) DEFAULT 0.00,
  `price`            DECIMAL(10,2) DEFAULT 0.00,
  `is_free`          TINYINT(1) DEFAULT 0,
  `is_active`        TINYINT(1) DEFAULT 1,
  `status`           ENUM('active','blocked') DEFAULT 'active',
  `deleted_at`       DATETIME DEFAULT NULL,
  `created_at`       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher`  (`teacher_id`),
  INDEX `idx_category` (`category_id`),
  INDEX `idx_status`   (`status`)
) ENGINE=InnoDB", "Create 'courses' table");

// courses – rename thumbnail → image if needed
$chk_img   = $conn->query("SHOW COLUMNS FROM `courses` LIKE 'image'");
$chk_thumb = $conn->query("SHOW COLUMNS FROM `courses` LIKE 'thumbnail'");
if ($chk_img && $chk_img->num_rows == 0 && $chk_thumb && $chk_thumb->num_rows > 0) {
    run($conn, "ALTER TABLE `courses` CHANGE COLUMN `thumbnail` `image` VARCHAR(255) DEFAULT NULL", "Rename 'thumbnail' to 'image' in 'courses'");
}

add_col_if_missing($conn, 'courses', 'mrp',              "ALTER TABLE `courses` ADD COLUMN `mrp`              DECIMAL(10,2) DEFAULT 0.00 AFTER `image`");
add_col_if_missing($conn, 'courses', 'meta_description',  "ALTER TABLE `courses` ADD COLUMN `meta_description` TEXT DEFAULT NULL AFTER `description`");
add_col_if_missing($conn, 'courses', 'image',             "ALTER TABLE `courses` ADD COLUMN `image`            VARCHAR(255) DEFAULT NULL AFTER `meta_description`");
add_col_if_missing($conn, 'courses', 'status',            "ALTER TABLE `courses` ADD COLUMN `status`           ENUM('active','blocked') DEFAULT 'active' AFTER `is_active`");
add_col_if_missing($conn, 'courses', 'deleted_at',        "ALTER TABLE `courses` ADD COLUMN `deleted_at`       DATETIME DEFAULT NULL AFTER `status`");

// ═════════════════════════════════════════════════════════════
//  11. ITEMS TABLE (chapters / videos / tests)
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `items` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `course_id`  INT NOT NULL,
  `teacher_id` INT DEFAULT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `type`       ENUM('video','pdf','live','test') DEFAULT 'video',
  `content`    TEXT DEFAULT NULL,
  `sort_order` INT DEFAULT 0,
  `is_free`    TINYINT(1) DEFAULT 0,
  `exam_mode`  TINYINT(1) DEFAULT 0,
  `start_time` DATETIME DEFAULT NULL,
  `end_time`   DATETIME DEFAULT NULL,
  `questions`  LONGTEXT DEFAULT NULL,
  `deleted_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_course`  (`course_id`),
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'items' table");

add_col_if_missing($conn, 'items', 'exam_mode',  "ALTER TABLE `items` ADD COLUMN `exam_mode`  TINYINT(1) DEFAULT 0 AFTER `is_free`");
add_col_if_missing($conn, 'items', 'start_time', "ALTER TABLE `items` ADD COLUMN `start_time` DATETIME DEFAULT NULL AFTER `exam_mode`");
add_col_if_missing($conn, 'items', 'end_time',   "ALTER TABLE `items` ADD COLUMN `end_time`   DATETIME DEFAULT NULL AFTER `start_time`");
add_col_if_missing($conn, 'items', 'questions',   "ALTER TABLE `items` ADD COLUMN `questions`  LONGTEXT DEFAULT NULL AFTER `end_time`");

// ═════════════════════════════════════════════════════════════
//  12. CHAPTERS TABLE  (legacy — add parent_id for nesting)
// ═════════════════════════════════════════════════════════════
$chk_chapters = $conn->query("SHOW TABLES LIKE 'chapters'");
if ($chk_chapters && $chk_chapters->num_rows > 0) {
    add_col_if_missing($conn, 'chapters', 'parent_id', "ALTER TABLE `chapters` ADD COLUMN `parent_id` INT(11) DEFAULT 0 AFTER `course_id`");
}

// ═════════════════════════════════════════════════════════════
//  13. VIDEOS TABLE  (legacy — add type column, rename filename → url)
// ═════════════════════════════════════════════════════════════
$chk_videos = $conn->query("SHOW TABLES LIKE 'videos'");
if ($chk_videos && $chk_videos->num_rows > 0) {
    add_col_if_missing($conn, 'videos', 'type', "ALTER TABLE `videos` ADD COLUMN `type` ENUM('youtube','gdrive') DEFAULT 'youtube' AFTER `title`");

    // Rename filename → url if filename still exists
    $chk_fn  = $conn->query("SHOW COLUMNS FROM `videos` LIKE 'filename'");
    $chk_url = $conn->query("SHOW COLUMNS FROM `videos` LIKE 'url'");
    if ($chk_fn && $chk_fn->num_rows > 0 && $chk_url && $chk_url->num_rows == 0) {
        run($conn, "ALTER TABLE `videos` CHANGE `filename` `url` VARCHAR(255)", "Rename 'filename' to 'url' in 'videos'");
    }
}

// ═════════════════════════════════════════════════════════════
//  14. ORDERS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `orders` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`             INT NOT NULL,
  `course_id`           INT NOT NULL,
  `amount`              DECIMAL(10,2) DEFAULT 0.00,
  `discount_amount`     DECIMAL(10,2) DEFAULT 0.00,
  `coupon_code`         VARCHAR(50) DEFAULT NULL,
  `status`              ENUM('pending','success','failed','refunded') DEFAULT 'pending',
  `razorpay_order_id`   VARCHAR(255) DEFAULT NULL,
  `razorpay_payment_id` VARCHAR(255) DEFAULT NULL,
  `razorpay_signature`  VARCHAR(255) DEFAULT NULL,
  `invoice_number`      VARCHAR(100) DEFAULT NULL,
  `created_at`          DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user`      (`user_id`),
  INDEX `idx_course`    (`course_id`),
  INDEX `idx_status`    (`status`),
  INDEX `idx_rzp_order` (`razorpay_order_id`)
) ENGINE=InnoDB", "Create 'orders' table");

// ═════════════════════════════════════════════════════════════
//  15. TICKETS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `tickets` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT NOT NULL,
  `teacher_id` INT DEFAULT NULL,
  `subject`    VARCHAR(255) NOT NULL,
  `message`    TEXT NOT NULL,
  `status`     ENUM('open','pending','closed') DEFAULT 'open',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user`    (`user_id`),
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'tickets' table");

// ═════════════════════════════════════════════════════════════
//  16. STREAMS TABLE  (Live Streaming)
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `streams` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id` INT DEFAULT NULL,
  `course_id`  INT DEFAULT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `stream_key` VARCHAR(255) DEFAULT NULL,
  `stream_url` VARCHAR(500) DEFAULT NULL,
  `status`     ENUM('idle','live','ended') DEFAULT 'idle',
  `started_at` DATETIME DEFAULT NULL,
  `ended_at`   DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'streams' table");

// ═════════════════════════════════════════════════════════════
//  17. LIVE CHAT TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `live_chat` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `stream_id`  INT NOT NULL,
  `user_id`    INT DEFAULT NULL,
  `teacher_id` INT DEFAULT NULL,
  `message`    TEXT NOT NULL,
  `is_blocked` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_stream` (`stream_id`)
) ENGINE=InnoDB", "Create 'live_chat' table");

// ═════════════════════════════════════════════════════════════
//  18. COMMUNITY GROUPS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `community_groups` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id`  INT DEFAULT NULL,
  `course_id`   INT DEFAULT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `type`        ENUM('general','course') DEFAULT 'general',
  `is_active`   TINYINT(1) DEFAULT 1,
  `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'community_groups' table");

// ═════════════════════════════════════════════════════════════
//  19. COMMUNITY POSTS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `community_posts` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `group_id`   INT NOT NULL,
  `user_id`    INT DEFAULT NULL,
  `teacher_id` INT DEFAULT NULL,
  `message`    TEXT NOT NULL,
  `image`      VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_group` (`group_id`)
) ENGINE=InnoDB", "Create 'community_posts' table");

// ═════════════════════════════════════════════════════════════
//  20. FORUM POSTS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `forum_posts` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `course_id`  INT DEFAULT NULL,
  `user_id`    INT NOT NULL,
  `teacher_id` INT DEFAULT NULL,
  `parent_id`  INT DEFAULT NULL,
  `title`      VARCHAR(255) DEFAULT NULL,
  `message`    TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_course`  (`course_id`),
  INDEX `idx_user`    (`user_id`),
  INDEX `idx_parent`  (`parent_id`),
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'forum_posts' table");

// forum_posts – ensure all columns exist (from migrate_forum_v2)
add_col_if_missing($conn, 'forum_posts', 'course_id',  "ALTER TABLE `forum_posts` ADD COLUMN `course_id`  INT DEFAULT NULL AFTER `id`");
add_col_if_missing($conn, 'forum_posts', 'teacher_id', "ALTER TABLE `forum_posts` ADD COLUMN `teacher_id` INT DEFAULT NULL AFTER `user_id`");
add_col_if_missing($conn, 'forum_posts', 'title',      "ALTER TABLE `forum_posts` ADD COLUMN `title`      VARCHAR(255) DEFAULT NULL AFTER `parent_id`");

// ═════════════════════════════════════════════════════════════
//  21. NOTIFICATIONS TABLE
// ═════════════════════════════════════════════════════════════
run($conn, "CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT DEFAULT NULL,
  `teacher_id` INT DEFAULT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `body`       TEXT DEFAULT NULL,
  `is_read`    TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user`    (`user_id`),
  INDEX `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB", "Create 'notifications' table");

// ═════════════════════════════════════════════════════════════
//  DONE — render results
// ═════════════════════════════════════════════════════════════
$ok   = count(array_filter($log, function ($l) { return $l[0] === 'ok'; }));
$err  = count(array_filter($log, function ($l) { return $l[0] === 'err'; }));
$skip = count(array_filter($log, function ($l) { return $l[0] === 'skip'; }));
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SkillzUp — DB Schema Fixer</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:40px 20px}
    .container{max-width:760px;margin:0 auto}
    .header{text-align:center;margin-bottom:36px}
    .header h1{font-size:2rem;font-weight:800;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .header p{color:#94a3b8;margin-top:6px}
    .card{background:#1e293b;border-radius:12px;padding:28px;margin-bottom:24px}
    .card h2{font-size:1rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px}
    .summary{display:flex;gap:12px;justify-content:center;margin-top:8px}
    .stat{background:#0f172a;border-radius:8px;padding:12px 24px;text-align:center}
    .stat .num{font-size:2rem;font-weight:800}
    .stat .label{font-size:.75rem;color:#94a3b8;margin-top:2px}
    .log-item{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #2d3748;font-size:.875rem}
    .log-item:last-child{border-bottom:none}
    .badge{flex-shrink:0;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700}
    .badge-ok{background:#064e3b;color:#34d399}
    .badge-err{background:#450a0a;color:#f87171}
    .badge-skip{background:#1c1917;color:#78716c}
    .green{color:#34d399}.red{color:#f87171}.gray{color:#78716c}
    .actions{display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap}
    .btn{display:inline-block;padding:12px 28px;border-radius:8px;font-weight:600;text-decoration:none;font-size:.9rem;transition:opacity .2s}
    .btn:hover{opacity:.85}
    .btn-primary{background:linear-gradient(135deg,#38bdf8,#818cf8);color:#0f172a}
    .btn-danger{background:#7f1d1d;color:#fca5a5}
    .notice{background:#451a03;border:1px solid #92400e;border-radius:8px;padding:14px 18px;color:#fcd34d;font-size:.875rem;margin-top:24px;line-height:1.6}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SkillzUp — DB Schema Fixer</h1>
      <p>Executed <?php echo date('d M Y, h:i A'); ?></p>
    </div>

    <div class="card">
      <h2>Summary</h2>
      <div class="summary">
        <div class="stat"><div class="num green"><?php echo $ok; ?></div><div class="label">Executed</div></div>
        <div class="stat"><div class="num red"><?php echo $err; ?></div><div class="label">Errors</div></div>
        <div class="stat"><div class="num gray"><?php echo $skip; ?></div><div class="label">Skipped</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Migration Log</h2>
      <?php foreach ($log as [$type, $msg]): ?>
        <div class="log-item">
          <span class="badge badge-<?php echo $type; ?>"><?php echo strtoupper($type); ?></span>
          <span><?php echo htmlspecialchars($msg); ?></span>
        </div>
      <?php endforeach; ?>
    </div>

    <div class="actions">
      <a href="/index.php" class="btn btn-primary">Go to App</a>
      <a href="/fix_db_schema.php" class="btn btn-danger">Re-run</a>
    </div>

    <div class="notice">
      This script is idempotent — safe to run multiple times.
      For production, delete or password-protect this file after use.
    </div>
  </div>
</body>
</html>
