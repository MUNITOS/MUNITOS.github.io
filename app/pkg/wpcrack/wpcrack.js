(() => {
  'use strict';
  const MANIFEST = Object.freeze({
    name: 'wpcrack',
    version: '1.0.0',
    description: 'WPCrack — WordPress security assessment toolkit. User enum and vulnerability scan. For AUTHORIZED pentest only.',
    help: 'wpcrack help',
    author: 'MUNITOS',
    official: false,
    default: false,
    securityLevel: 'high',
    permissions: Object.freeze({
      storage: 'none',
      cookies: 'none',
      network: 'read',
      filesystem: 'none'
    }),
    commands: Object.freeze(['wpcrack']),
    dependencies: Object.freeze([]),
    entry: 'install'
  });

  const PKG = 'wpcrack';
  const VERSION = MANIFEST.version;
  const GLOBAL_KEY = '__munitos_pkg_wpcrack';

  const PROFILES = Object.freeze({
    high: Object.freeze({ concurrent: 384, minConcurrent: 192, maxConcurrent: 768, label: 'HIGH-POWER' }),
    low: Object.freeze({ concurrent: 48, minConcurrent: 24, maxConcurrent: 192, label: 'LOW-POWER (mobile)' })
  });

  const DEFAULTS = Object.freeze({
    timeout: 12000,
    probeTimeout: 7000
  });

  const BASE_WP_PATHS = Object.freeze([
    { path: '/wp-login.php', type: 'login', risk: 'info', label: 'Login page' },
    { path: '/wp-admin/', type: 'admin', risk: 'info', label: 'Admin panel' },
    { path: '/wp-admin/admin-ajax.php', type: 'admin-ajax', risk: 'medium', label: 'Admin AJAX' },
    { path: '/wp-admin/admin-post.php', type: 'admin-post', risk: 'low', label: 'Admin POST handler' },
    { path: '/wp-admin/install.php', type: 'install', risk: 'critical', label: 'Install page' },
    { path: '/wp-admin/setup-config.php', type: 'setup', risk: 'critical', label: 'Setup config' },
    { path: '/wp-admin/upgrade.php', type: 'upgrade', risk: 'high', label: 'Upgrade page' },
    { path: '/wp-admin/theme-editor.php', type: 'admin', risk: 'high', label: 'Theme editor' },
    { path: '/wp-admin/plugin-editor.php', type: 'admin', risk: 'high', label: 'Plugin editor' },
    { path: '/wp-admin/network/', type: 'multisite', risk: 'medium', label: 'Network admin' },
    { path: '/wp-admin/network/setup.php', type: 'multisite', risk: 'high', label: 'Network setup' },
    { path: '/wp-admin/maint/repair.php', type: 'maintenance', risk: 'high', label: 'DB repair page' },
    { path: '/wp-admin/options.php', type: 'admin', risk: 'high', label: 'Options page' },
    { path: '/wp-admin/options-general.php', type: 'admin', risk: 'medium', label: 'General options' },
    { path: '/wp-admin/options-writing.php', type: 'admin', risk: 'medium', label: 'Writing options' },
    { path: '/wp-admin/options-reading.php', type: 'admin', risk: 'medium', label: 'Reading options' },
    { path: '/wp-admin/options-discussion.php', type: 'admin', risk: 'medium', label: 'Discussion options' },
    { path: '/wp-admin/options-media.php', type: 'admin', risk: 'medium', label: 'Media options' },
    { path: '/wp-admin/options-permalink.php', type: 'admin', risk: 'medium', label: 'Permalink options' },
    { path: '/wp-admin/options-privacy.php', type: 'admin', risk: 'medium', label: 'Privacy options' },
    { path: '/wp-admin/users.php', type: 'admin', risk: 'high', label: 'Users management' },
    { path: '/wp-admin/user-new.php', type: 'admin', risk: 'high', label: 'New user page' },
    { path: '/wp-admin/user-edit.php', type: 'admin', risk: 'medium', label: 'User edit' },
    { path: '/wp-admin/profile.php', type: 'admin', risk: 'medium', label: 'Profile page' },
    { path: '/wp-admin/plugins.php', type: 'admin', risk: 'medium', label: 'Plugins page' },
    { path: '/wp-admin/plugin-install.php', type: 'admin', risk: 'medium', label: 'Plugin install' },
    { path: '/wp-admin/themes.php', type: 'admin', risk: 'medium', label: 'Themes page' },
    { path: '/wp-admin/theme-install.php', type: 'admin', risk: 'medium', label: 'Theme install' },
    { path: '/wp-admin/update-core.php', type: 'admin', risk: 'medium', label: 'Update core' },
    { path: '/wp-admin/update.php', type: 'admin', risk: 'medium', label: 'Update handler' },
    { path: '/wp-admin/export.php', type: 'admin', risk: 'high', label: 'Export data' },
    { path: '/wp-admin/import.php', type: 'admin', risk: 'high', label: 'Import data' },
    { path: '/wp-admin/edit.php', type: 'admin', risk: 'medium', label: 'Edit posts' },
    { path: '/wp-admin/post-new.php', type: 'admin', risk: 'medium', label: 'New post' },
    { path: '/wp-admin/post.php', type: 'admin', risk: 'medium', label: 'Edit post' },
    { path: '/wp-admin/edit-comments.php', type: 'admin', risk: 'medium', label: 'Edit comments' },
    { path: '/wp-admin/upload.php', type: 'admin', risk: 'medium', label: 'Media library' },
    { path: '/wp-admin/media-new.php', type: 'admin', risk: 'medium', label: 'Add media' },
    { path: '/wp-admin/nav-menus.php', type: 'admin', risk: 'medium', label: 'Nav menus' },
    { path: '/wp-admin/widgets.php', type: 'admin', risk: 'medium', label: 'Widgets' },
    { path: '/wp-admin/customize.php', type: 'admin', risk: 'high', label: 'Customizer' },
    { path: '/wp-admin/tools.php', type: 'admin', risk: 'medium', label: 'Tools page' },
    { path: '/wp-admin/site-health.php', type: 'admin', risk: 'low', label: 'Site health' },
    { path: '/wp-admin/credits.php', type: 'admin', risk: 'low', label: 'Credits page' },
    { path: '/wp-admin/freedoms.php', type: 'admin', risk: 'low', label: 'Freedoms page' },
    { path: '/wp-admin/about.php', type: 'admin', risk: 'low', label: 'About page' },
    { path: '/wp-admin/privacy-policy-guide.php', type: 'admin', risk: 'low', label: 'Privacy guide' },
    { path: '/wp-admin/load-scripts.php', type: 'admin-ajax', risk: 'low', label: 'Load scripts' },
    { path: '/wp-admin/load-styles.php', type: 'admin-ajax', risk: 'low', label: 'Load styles' },
    { path: '/wp-admin/async-upload.php', type: 'admin-ajax', risk: 'medium', label: 'Async upload' },
    { path: '/wp-admin/ms-admin.php', type: 'multisite', risk: 'medium', label: 'MS Admin' },
    { path: '/wp-admin/ms-sites.php', type: 'multisite', risk: 'medium', label: 'MS Sites' },
    { path: '/wp-admin/ms-users.php', type: 'multisite', risk: 'medium', label: 'MS Users' },
    { path: '/wp-admin/ms-themes.php', type: 'multisite', risk: 'medium', label: 'MS Themes' },
    { path: '/wp-admin/ms-options.php', type: 'multisite', risk: 'medium', label: 'MS Options' },
    { path: '/wp-admin/ms-delete-site.php', type: 'multisite', risk: 'medium', label: 'MS Delete site' },
    { path: '/wp-admin/ms-upgrade-network.php', type: 'multisite', risk: 'medium', label: 'MS Upgrade network' },
    { path: '/wp-admin/my-sites.php', type: 'multisite', risk: 'low', label: 'My Sites' },
    { path: '/wp-admin/network.php', type: 'multisite', risk: 'medium', label: 'Network setup' },
    { path: '/wp-admin/link-manager.php', type: 'admin', risk: 'low', label: 'Link manager' },
    { path: '/wp-admin/link-add.php', type: 'admin', risk: 'low', label: 'Add link' },
    { path: '/wp-admin/edit-tags.php', type: 'admin', risk: 'low', label: 'Edit tags' },
    { path: '/wp-admin/edit-link-form.php', type: 'admin', risk: 'low', label: 'Edit link form' },
    { path: '/wp-admin/revision.php', type: 'admin', risk: 'low', label: 'Revisions' },
    { path: '/wp-admin/term.php', type: 'admin', risk: 'low', label: 'Term edit' },
    { path: '/wp-admin/comment.php', type: 'admin', risk: 'low', label: 'Comment edit' },
    { path: '/wp-admin/moderation.php', type: 'admin', risk: 'low', label: 'Moderation' },
    { path: '/wp-admin/includes/', type: 'dir', risk: 'low', label: 'Admin includes dir' },
    { path: '/wp-admin/css/', type: 'dir', risk: 'info', label: 'Admin CSS dir' },
    { path: '/wp-admin/js/', type: 'dir', risk: 'info', label: 'Admin JS dir' },
    { path: '/wp-admin/images/', type: 'dir', risk: 'info', label: 'Admin images dir' },
    { path: '/wp-signup.php', type: 'signup', risk: 'medium', label: 'Signup page' },
    { path: '/wp-activate.php', type: 'activate', risk: 'low', label: 'Activate page' },
    { path: '/wp-register.php', type: 'register', risk: 'low', label: 'Legacy register' },
    { path: '/wp-trackback.php', type: 'trackback', risk: 'low', label: 'Trackback' },
    { path: '/wp-comments-post.php', type: 'comments', risk: 'low', label: 'Comments POST' },
    { path: '/wp-links-opml.php', type: 'opml', risk: 'low', label: 'Links OPML' },
    { path: '/wp-mail.php', type: 'mail', risk: 'medium', label: 'Mail handler' },
    { path: '/wp-cron.php', type: 'cron', risk: 'low', label: 'WP-Cron' },
    { path: '/wp-load.php', type: 'core', risk: 'medium', label: 'WP Load' },
    { path: '/wp-settings.php', type: 'core', risk: 'medium', label: 'WP Settings' },
    { path: '/wp-blog-header.php', type: 'core', risk: 'medium', label: 'Blog header' },
    { path: '/wp-config.php', type: 'config', risk: 'critical', label: 'Config (direct)' },
    { path: '/xmlrpc.php', type: 'xmlrpc', risk: 'medium', label: 'XML-RPC endpoint' },
    { path: '/wp-json/', type: 'rest-api', risk: 'info', label: 'REST API root' },
    { path: '/wp-json/wp/v2/', type: 'rest-api', risk: 'info', label: 'REST API v2' },
    { path: '/wp-json/wp/v2/users', type: 'user-enum-api', risk: 'high', label: 'REST API users' },
    { path: '/wp-json/wp/v2/users/me', type: 'rest-api', risk: 'low', label: 'REST API users/me' },
    { path: '/wp-json/wp/v2/users?per_page=100', type: 'user-enum-api', risk: 'high', label: 'REST API users (100)' },
    { path: '/wp-json/wp/v2/posts', type: 'rest-api', risk: 'info', label: 'REST API posts' },
    { path: '/wp-json/wp/v2/pages', type: 'rest-api', risk: 'info', label: 'REST API pages' },
    { path: '/wp-json/wp/v2/media', type: 'rest-api', risk: 'info', label: 'REST API media' },
    { path: '/wp-json/wp/v2/comments', type: 'rest-api', risk: 'low', label: 'REST API comments' },
    { path: '/wp-json/wp/v2/categories', type: 'rest-api', risk: 'info', label: 'REST API categories' },
    { path: '/wp-json/wp/v2/tags', type: 'rest-api', risk: 'info', label: 'REST API tags' },
    { path: '/wp-json/wp/v2/taxonomies', type: 'rest-api', risk: 'info', label: 'REST API taxonomies' },
    { path: '/wp-json/wp/v2/types', type: 'rest-api', risk: 'info', label: 'REST API types' },
    { path: '/wp-json/wp/v2/statuses', type: 'rest-api', risk: 'info', label: 'REST API statuses' },
    { path: '/wp-json/wp/v2/settings', type: 'rest-api', risk: 'medium', label: 'REST API settings' },
    { path: '/wp-json/wp/v2/blocks', type: 'rest-api', risk: 'low', label: 'REST API blocks' },
    { path: '/wp-json/wp/v2/search', type: 'rest-api', risk: 'info', label: 'REST API search' },
    { path: '/wp-json/wp/v2/menus', type: 'rest-api', risk: 'low', label: 'REST API menus' },
    { path: '/wp-json/wp/v2/menu-items', type: 'rest-api', risk: 'low', label: 'REST API menu-items' },
    { path: '/wp-json/wp/v2/menu-locations', type: 'rest-api', risk: 'low', label: 'REST API menu-locations' },
    { path: '/wp-json/wp/v2/plugins', type: 'rest-api', risk: 'medium', label: 'REST API plugins' },
    { path: '/wp-json/wp/v2/themes', type: 'rest-api', risk: 'medium', label: 'REST API themes' },
    { path: '/wp-json/wp/v2/templates', type: 'rest-api', risk: 'low', label: 'REST API templates' },
    { path: '/wp-json/wp/v2/global-styles', type: 'rest-api', risk: 'low', label: 'REST API global styles' },
    { path: '/wp-json/wp/v2/widgets', type: 'rest-api', risk: 'low', label: 'REST API widgets' },
    { path: '/wp-json/wp/v2/sidebars', type: 'rest-api', risk: 'low', label: 'REST API sidebars' },
    { path: '/wp-json/wp/v2/block-types', type: 'rest-api', risk: 'low', label: 'REST API block types' },
    { path: '/wp-json/wp/v2/block-directory', type: 'rest-api', risk: 'low', label: 'REST API block directory' },
    { path: '/wp-json/wp/v2/block-renderer', type: 'rest-api', risk: 'low', label: 'REST API block renderer' },
    { path: '/wp-json/wp/v2/pattern-directory', type: 'rest-api', risk: 'low', label: 'REST API patterns' },
    { path: '/wp-json/wp/v2/font-families', type: 'rest-api', risk: 'low', label: 'REST API font families' },
    { path: '/wp-json/wp/v2/users/1', type: 'rest-api', risk: 'low', label: 'REST user ID 1' },
    { path: '/wp-json/wp/v2/users/2', type: 'rest-api', risk: 'low', label: 'REST user ID 2' },
    { path: '/wp-json/oembed/1.0/embed', type: 'rest-api', risk: 'low', label: 'oEmbed endpoint' },
    { path: '/wp-json/contact-form-7/v1/contact-forms', type: 'rest-api', risk: 'low', label: 'CF7 REST' },
    { path: '/wp-json/wordfence/v1/', type: 'rest-api', risk: 'low', label: 'Wordfence REST' },
    { path: '/?rest_route=/wp/v2/users', type: 'user-enum-api', risk: 'high', label: 'REST users (rest_route)' },
    { path: '/?rest_route=/wp/v2/posts', type: 'rest-api', risk: 'info', label: 'REST posts (rest_route)' },
    { path: '/?rest_route=/wp/v2/pages', type: 'rest-api', risk: 'info', label: 'REST pages (rest_route)' },
    { path: '/?rest_route=/', type: 'rest-api', risk: 'info', label: 'REST root (rest_route)' },
    { path: '/index.php?rest_route=/wp/v2/users', type: 'user-enum-api', risk: 'high', label: 'REST users (index.php)' },
    { path: '/index.php?rest_route=/', type: 'rest-api', risk: 'info', label: 'REST root (index.php)' },
    { path: '/?author=1', type: 'user-enum-author', risk: 'high', label: 'Author archive 1' },
    { path: '/?author=2', type: 'user-enum-author', risk: 'high', label: 'Author archive 2' },
    { path: '/?author=3', type: 'user-enum-author', risk: 'high', label: 'Author archive 3' },
    { path: '/?author=4', type: 'user-enum-author', risk: 'high', label: 'Author archive 4' },
    { path: '/?author=5', type: 'user-enum-author', risk: 'high', label: 'Author archive 5' },
    { path: '/?author=6', type: 'user-enum-author', risk: 'high', label: 'Author archive 6' },
    { path: '/?author=7', type: 'user-enum-author', risk: 'high', label: 'Author archive 7' },
    { path: '/?author=8', type: 'user-enum-author', risk: 'high', label: 'Author archive 8' },
    { path: '/?author=9', type: 'user-enum-author', risk: 'high', label: 'Author archive 9' },
    { path: '/?author=10', type: 'user-enum-author', risk: 'high', label: 'Author archive 10' },
    { path: '/author/admin/', type: 'user-enum-author', risk: 'high', label: 'Author slug admin' },
    { path: '/wp-sitemap.xml', type: 'sitemap', risk: 'info', label: 'WP Sitemap' },
    { path: '/wp-sitemap-users-1.xml', type: 'sitemap', risk: 'medium', label: 'WP Sitemap users' },
    { path: '/wp-sitemap-posts-post-1.xml', type: 'sitemap', risk: 'info', label: 'WP Sitemap posts' },
    { path: '/wp-sitemap-posts-page-1.xml', type: 'sitemap', risk: 'info', label: 'WP Sitemap pages' },
    { path: '/wp-sitemap-taxonomies-category-1.xml', type: 'sitemap', risk: 'low', label: 'WP Sitemap categories' },
    { path: '/wp-sitemap-taxonomies-post_tag-1.xml', type: 'sitemap', risk: 'low', label: 'WP Sitemap tags' },
    { path: '/sitemap.xml', type: 'sitemap', risk: 'info', label: 'Sitemap' },
    { path: '/sitemap_index.xml', type: 'sitemap', risk: 'info', label: 'Sitemap index' },
    { path: '/sitemap-index.xml', type: 'sitemap', risk: 'info', label: 'Sitemap index (alt)' },
    { path: '/sitemap.xml.gz', type: 'sitemap', risk: 'info', label: 'Sitemap gz' },
    { path: '/feed/', type: 'feed', risk: 'info', label: 'RSS feed' },
    { path: '/feed/atom/', type: 'feed', risk: 'info', label: 'Atom feed' },
    { path: '/feed/rss/', type: 'feed', risk: 'info', label: 'RSS 1.0 feed' },
    { path: '/feed/rss2/', type: 'feed', risk: 'info', label: 'RSS 2.0 feed' },
    { path: '/feed/rdf/', type: 'feed', risk: 'info', label: 'RDF feed' },
    { path: '/comments/feed/', type: 'feed', risk: 'info', label: 'Comments feed' },
    { path: '/?feed=rss2', type: 'feed', risk: 'info', label: 'Feed rss2 query' },
    { path: '/?feed=atom', type: 'feed', risk: 'info', label: 'Feed atom query' },
    { path: '/?feed=rss', type: 'feed', risk: 'info', label: 'Feed rss query' },
    { path: '/robots.txt', type: 'robots', risk: 'info', label: 'Robots.txt' },
    { path: '/readme.html', type: 'version-disclosure', risk: 'medium', label: 'readme.html' },
    { path: '/license.txt', type: 'version-disclosure', risk: 'low', label: 'license.txt' },
    { path: '/wp-includes/version.php', type: 'version-disclosure', risk: 'medium', label: 'version.php' },
    { path: '/wp-includes/wp-db.php', type: 'core', risk: 'low', label: 'wp-db.php' },
    { path: '/wp-includes/pluggable.php', type: 'core', risk: 'low', label: 'pluggable.php' },
    { path: '/wp-includes/functions.php', type: 'core', risk: 'low', label: 'functions.php' },
    { path: '/wp-includes/load.php', type: 'core', risk: 'low', label: 'load.php' },
    { path: '/wp-includes/user.php', type: 'core', risk: 'low', label: 'user.php' },
    { path: '/wp-includes/class-wp-user.php', type: 'core', risk: 'low', label: 'class-wp-user.php' },
    { path: '/wp-includes/default-constants.php', type: 'core', risk: 'low', label: 'default-constants.php' },
    { path: '/wp-includes/js/', type: 'dir', risk: 'info', label: 'wp-includes js' },
    { path: '/wp-includes/css/', type: 'dir', risk: 'info', label: 'wp-includes css' },
    { path: '/wp-includes/images/', type: 'dir', risk: 'info', label: 'wp-includes images' },
    { path: '/wp-includes/ID3/', type: 'dir', risk: 'info', label: 'wp-includes ID3' },
    { path: '/wp-includes/SimplePie/', type: 'dir', risk: 'low', label: 'SimplePie lib' },
    { path: '/wp-includes/PHPMailer/', type: 'dir', risk: 'low', label: 'PHPMailer lib' },
    { path: '/wp-includes/Requests/', type: 'dir', risk: 'low', label: 'Requests lib' },
    { path: '/wp-config.php.bak', type: 'backup', risk: 'critical', label: 'Config backup (.bak)' },
    { path: '/wp-config.php~', type: 'backup', risk: 'critical', label: 'Config backup (~)' },
    { path: '/wp-config.php.save', type: 'backup', risk: 'critical', label: 'Config backup (.save)' },
    { path: '/wp-config.php.old', type: 'backup', risk: 'critical', label: 'Config backup (.old)' },
    { path: '/wp-config.php.orig', type: 'backup', risk: 'critical', label: 'Config backup (.orig)' },
    { path: '/wp-config.php.original', type: 'backup', risk: 'critical', label: 'Config backup (.original)' },
    { path: '/wp-config.php.backup', type: 'backup', risk: 'critical', label: 'Config backup (.backup)' },
    { path: '/wp-config.php.copy', type: 'backup', risk: 'critical', label: 'Config backup (.copy)' },
    { path: '/wp-config.php.txt', type: 'backup', risk: 'critical', label: 'Config backup (.txt)' },
    { path: '/wp-config.php.bkp', type: 'backup', risk: 'critical', label: 'Config backup (.bkp)' },
    { path: '/wp-config.php.disabled', type: 'backup', risk: 'critical', label: 'Config disabled' },
    { path: '/wp-config.php.1', type: 'backup', risk: 'critical', label: 'Config backup (.1)' },
    { path: '/wp-config.php.2', type: 'backup', risk: 'critical', label: 'Config backup (.2)' },
    { path: '/wp-config.php.3', type: 'backup', risk: 'critical', label: 'Config backup (.3)' },
    { path: '/wp-config.php.gz', type: 'backup', risk: 'critical', label: 'Config backup (.gz)' },
    { path: '/wp-config.php.zip', type: 'backup', risk: 'critical', label: 'Config backup (.zip)' },
    { path: '/wp-config.php.tar', type: 'backup', risk: 'critical', label: 'Config backup (.tar)' },
    { path: '/wp-config.php.tar.gz', type: 'backup', risk: 'critical', label: 'Config backup (.tar.gz)' },
    { path: '/wp-config.txt', type: 'backup', risk: 'critical', label: 'Config text' },
    { path: '/wp-config.bak', type: 'backup', risk: 'critical', label: 'Config .bak (short)' },
    { path: '/wp-config.old', type: 'backup', risk: 'critical', label: 'Config .old (short)' },
    { path: '/wp-config-sample.php', type: 'version-disclosure', risk: 'low', label: 'Config sample' },
    { path: '/wp-config-sample.php.bak', type: 'backup', risk: 'critical', label: 'Config sample backup' },
    { path: '/.wp-config.php.swp', type: 'backup', risk: 'critical', label: 'Vim swap file' },
    { path: '/.wp-config.php.swo', type: 'backup', risk: 'critical', label: 'Vim swap file (swo)' },
    { path: '/.wp-config.php.un~', type: 'backup', risk: 'critical', label: 'Vim undo file' },
    { path: '/wp-config.php.swp', type: 'backup', risk: 'critical', label: 'Vim swap (no dot)' },
    { path: '/wp-config.php.swo', type: 'backup', risk: 'critical', label: 'Vim swap (swo)' },
    { path: '/config.php.bak', type: 'backup', risk: 'critical', label: 'config.php.bak' },
    { path: '/config.bak', type: 'backup', risk: 'critical', label: 'config.bak' },
    { path: '/wp-config.inc', type: 'backup', risk: 'critical', label: 'wp-config.inc' },
    { path: '/wp-config.inc.php', type: 'backup', risk: 'critical', label: 'wp-config.inc.php' },
    { path: '/wp-config.php.dist', type: 'backup', risk: 'high', label: 'Config .dist' },
    { path: '/wp-content/debug.log', type: 'log', risk: 'high', label: 'Debug log' },
    { path: '/wp-content/error_log', type: 'log', risk: 'high', label: 'Error log' },
    { path: '/wp-content/uploads/debug.log', type: 'log', risk: 'high', label: 'Uploads debug log' },
    { path: '/wp-content/uploads/error_log', type: 'log', risk: 'high', label: 'Uploads error log' },
    { path: '/debug.log', type: 'log', risk: 'high', label: 'Root debug log' },
    { path: '/error_log', type: 'log', risk: 'high', label: 'Root error log' },
    { path: '/wp-admin/error_log', type: 'log', risk: 'high', label: 'Admin error log' },
    { path: '/wp-includes/error_log', type: 'log', risk: 'high', label: 'Includes error log' },
    { path: '/wp-content/uploads/', type: 'uploads', risk: 'low', label: 'Uploads dir' },
    { path: '/wp-content/uploads/2024/', type: 'uploads', risk: 'low', label: 'Uploads 2024' },
    { path: '/wp-content/uploads/2025/', type: 'uploads', risk: 'low', label: 'Uploads 2025' },
    { path: '/wp-content/', type: 'dir', risk: 'info', label: 'wp-content dir' },
    { path: '/wp-content/plugins/', type: 'plugins', risk: 'info', label: 'Plugins dir' },
    { path: '/wp-content/themes/', type: 'themes', risk: 'info', label: 'Themes dir' },
    { path: '/wp-content/mu-plugins/', type: 'mu-plugins', risk: 'low', label: 'MU-Plugins dir' },
    { path: '/wp-content/upgrade/', type: 'dir', risk: 'low', label: 'Upgrade dir' },
    { path: '/wp-content/cache/', type: 'dir', risk: 'low', label: 'Cache dir' },
    { path: '/wp-content/languages/', type: 'dir', risk: 'low', label: 'Languages dir' },
    { path: '/wp-content/languages/plugins/', type: 'dir', risk: 'low', label: 'Plugin languages dir' },
    { path: '/wp-content/languages/themes/', type: 'dir', risk: 'low', label: 'Theme languages dir' },
    { path: '/wp-content/backup-db/', type: 'backup', risk: 'critical', label: 'Backup-DB dir' },
    { path: '/wp-content/backups/', type: 'backup', risk: 'critical', label: 'Backups dir' },
    { path: '/wp-content/backup/', type: 'backup', risk: 'critical', label: 'Backup dir' },
    { path: '/wp-content/uploads/backup/', type: 'backup', risk: 'critical', label: 'Uploads backup dir' },
    { path: '/wp-content/uploads/backups/', type: 'backup', risk: 'critical', label: 'Uploads backups dir' },
    { path: '/wp-content/uploads/dump.sql', type: 'backup', risk: 'critical', label: 'Uploads dump.sql' },
    { path: '/wp-content/uploads/backup.sql', type: 'backup', risk: 'critical', label: 'Uploads backup.sql' },
    { path: '/wp-content/uploads/database.sql', type: 'backup', risk: 'critical', label: 'Uploads database.sql' },
    { path: '/wp-content/advanced-cache.php', type: 'config', risk: 'medium', label: 'Advanced cache' },
    { path: '/wp-content/object-cache.php', type: 'config', risk: 'medium', label: 'Object cache' },
    { path: '/wp-content/db.php', type: 'config', risk: 'high', label: 'DB drop-in' },
    { path: '/wp-content/sunrise.php', type: 'config', risk: 'high', label: 'Sunrise drop-in' },
    { path: '/wp-content/maintenance.php', type: 'config', risk: 'low', label: 'Maintenance mode' },
    { path: '/wp-content/wp-cache-config.php', type: 'config', risk: 'medium', label: 'WP-Cache config' },
    { path: '/wp-content/wp-config.php', type: 'backup', risk: 'critical', label: 'Config in wp-content' },
    { path: '/wp-content/wp-config.php.bak', type: 'backup', risk: 'critical', label: 'Config backup in wp-content' },
    { path: '/wp-includes/', type: 'dir', risk: 'info', label: 'wp-includes dir' },
    { path: '/.htaccess', type: 'config', risk: 'medium', label: '.htaccess' },
    { path: '/.htaccess.bak', type: 'backup', risk: 'high', label: '.htaccess.bak' },
    { path: '/.htaccess.old', type: 'backup', risk: 'high', label: '.htaccess.old' },
    { path: '/.htaccess.save', type: 'backup', risk: 'high', label: '.htaccess.save' },
    { path: '/.htaccess.txt', type: 'backup', risk: 'high', label: '.htaccess.txt' },
    { path: '/.htpasswd', type: 'config', risk: 'critical', label: '.htpasswd' },
    { path: '/.env', type: 'backup', risk: 'critical', label: '.env file' },
    { path: '/.env.bak', type: 'backup', risk: 'critical', label: '.env.bak' },
    { path: '/.env.local', type: 'backup', risk: 'critical', label: '.env.local' },
    { path: '/.git/config', type: 'backup', risk: 'critical', label: '.git config' },
    { path: '/.git/HEAD', type: 'backup', risk: 'critical', label: '.git HEAD' },
    { path: '/.git/index', type: 'backup', risk: 'critical', label: '.git index' },
    { path: '/.gitignore', type: 'backup', risk: 'medium', label: '.gitignore' },
    { path: '/.svn/entries', type: 'backup', risk: 'critical', label: '.svn entries' },
    { path: '/.svn/wc.db', type: 'backup', risk: 'critical', label: '.svn wc.db' },
    { path: '/.DS_Store', type: 'backup', risk: 'low', label: '.DS_Store' },
    { path: '/.well-known/security.txt', type: 'security', risk: 'info', label: 'security.txt' },
    { path: '/security.txt', type: 'security', risk: 'info', label: 'security.txt (root)' },
    { path: '/humans.txt', type: 'humans', risk: 'info', label: 'humans.txt' },
    { path: '/CHANGELOG.md', type: 'version-disclosure', risk: 'low', label: 'CHANGELOG.md' },
    { path: '/CHANGELOG.txt', type: 'version-disclosure', risk: 'low', label: 'CHANGELOG.txt' },
    { path: '/backup.zip', type: 'backup', risk: 'critical', label: 'backup.zip' },
    { path: '/backup.tar', type: 'backup', risk: 'critical', label: 'backup.tar' },
    { path: '/backup.tar.gz', type: 'backup', risk: 'critical', label: 'backup.tar.gz' },
    { path: '/backup.sql', type: 'backup', risk: 'critical', label: 'backup.sql' },
    { path: '/backup.sql.gz', type: 'backup', risk: 'critical', label: 'backup.sql.gz' },
    { path: '/database.sql', type: 'backup', risk: 'critical', label: 'database.sql' },
    { path: '/db.sql', type: 'backup', risk: 'critical', label: 'db.sql' },
    { path: '/dump.sql', type: 'backup', risk: 'critical', label: 'dump.sql' },
    { path: '/dump.sql.gz', type: 'backup', risk: 'critical', label: 'dump.sql.gz' },
    { path: '/site.zip', type: 'backup', risk: 'critical', label: 'site.zip' },
    { path: '/website.zip', type: 'backup', risk: 'critical', label: 'website.zip' },
    { path: '/www.zip', type: 'backup', risk: 'critical', label: 'www.zip' },
    { path: '/public_html.zip', type: 'backup', risk: 'critical', label: 'public_html.zip' },
    { path: '/backup/wp-config.php', type: 'backup', risk: 'critical', label: 'backup/wp-config.php' },
    { path: '/old/wp-config.php', type: 'backup', risk: 'critical', label: 'old/wp-config.php' },
    { path: '/test/wp-config.php', type: 'backup', risk: 'critical', label: 'test/wp-config.php' },
    { path: '/new/wp-config.php', type: 'backup', risk: 'critical', label: 'new/wp-config.php' },
    { path: '/dev/wp-config.php', type: 'backup', risk: 'critical', label: 'dev/wp-config.php' },
    { path: '/wp/wp-config.php', type: 'backup', risk: 'critical', label: 'wp/wp-config.php' },
    { path: '/blog/wp-config.php', type: 'backup', risk: 'critical', label: 'blog/wp-config.php' },
    { path: '/wordpress/wp-config.php', type: 'backup', risk: 'critical', label: 'wordpress/wp-config.php' },
    { path: '/wp-content/plugins/akismet/', type: 'plugin-dir', risk: 'low', label: 'Akismet plugin' },
    { path: '/wp-content/plugins/akismet/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Akismet readme' },
    { path: '/wp-content/plugins/hello.php', type: 'plugin-file', risk: 'low', label: 'Hello Dolly plugin' },
    { path: '/wp-content/plugins/jetpack/', type: 'plugin-dir', risk: 'low', label: 'Jetpack plugin' },
    { path: '/wp-content/plugins/jetpack/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Jetpack readme' },
    { path: '/wp-content/plugins/woocommerce/', type: 'plugin-dir', risk: 'low', label: 'WooCommerce plugin' },
    { path: '/wp-content/plugins/woocommerce/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WooCommerce readme' },
    { path: '/wp-content/plugins/contact-form-7/', type: 'plugin-dir', risk: 'low', label: 'Contact Form 7' },
    { path: '/wp-content/plugins/contact-form-7/readme.txt', type: 'plugin-file', risk: 'medium', label: 'CF7 readme' },
    { path: '/wp-content/plugins/wordfence/', type: 'plugin-dir', risk: 'low', label: 'Wordfence plugin' },
    { path: '/wp-content/plugins/wordfence/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Wordfence readme' },
    { path: '/wp-content/plugins/wordpress-seo/', type: 'plugin-dir', risk: 'low', label: 'Yoast SEO' },
    { path: '/wp-content/plugins/wordpress-seo/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Yoast readme' },
    { path: '/wp-content/plugins/all-in-one-seo-pack/', type: 'plugin-dir', risk: 'low', label: 'AIOSEO' },
    { path: '/wp-content/plugins/elementor/', type: 'plugin-dir', risk: 'low', label: 'Elementor' },
    { path: '/wp-content/plugins/elementor/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Elementor readme' },
    { path: '/wp-content/plugins/w3-total-cache/', type: 'plugin-dir', risk: 'low', label: 'W3TC' },
    { path: '/wp-content/plugins/wp-super-cache/', type: 'plugin-dir', risk: 'low', label: 'WP Super Cache' },
    { path: '/wp-content/plugins/wpforms-lite/', type: 'plugin-dir', risk: 'low', label: 'WPForms' },
    { path: '/wp-content/plugins/duplicator/', type: 'plugin-dir', risk: 'low', label: 'Duplicator' },
    { path: '/wp-content/plugins/duplicator/installer.php', type: 'plugin-file', risk: 'high', label: 'Duplicator installer' },
    { path: '/wp-content/plugins/updraftplus/', type: 'plugin-dir', risk: 'low', label: 'UpdraftPlus' },
    { path: '/wp-content/plugins/backup/', type: 'plugin-dir', risk: 'low', label: 'Backup dir' },
    { path: '/wp-content/plugins/advanced-custom-fields/', type: 'plugin-dir', risk: 'low', label: 'ACF plugin' },
    { path: '/wp-content/plugins/wordpress-importer/', type: 'plugin-dir', risk: 'low', label: 'WP Importer' },
    { path: '/wp-content/plugins/revslider/', type: 'plugin-dir', risk: 'medium', label: 'Revolution Slider' },
    { path: '/wp-content/plugins/js_composer/', type: 'plugin-dir', risk: 'medium', label: 'JS Composer' },
    { path: '/wp-content/plugins/layer-slider/', type: 'plugin-dir', risk: 'medium', label: 'LayerSlider' },
    { path: '/wp-content/plugins/gravityforms/', type: 'plugin-dir', risk: 'low', label: 'Gravity Forms' },
    { path: '/wp-content/plugins/wp-rocket/', type: 'plugin-dir', risk: 'low', label: 'WP Rocket' },
    { path: '/wp-content/plugins/autoptimize/', type: 'plugin-dir', risk: 'low', label: 'Autoptimize' },
    { path: '/wp-content/plugins/redirection/', type: 'plugin-dir', risk: 'low', label: 'Redirection' },
    { path: '/wp-content/plugins/wordpress-popular-posts/', type: 'plugin-dir', risk: 'low', label: 'WPP' },
    { path: '/wp-content/plugins/wp-file-manager/', type: 'plugin-dir', risk: 'high', label: 'WP File Manager' },
    { path: '/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php', type: 'plugin-file', risk: 'critical', label: 'WP File Manager connector' },
    { path: '/wp-content/plugins/wp-file-manager/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WP File Manager readme' },
    { path: '/wp-content/plugins/royal-elementor-addons/', type: 'plugin-dir', risk: 'medium', label: 'Royal Elementor' },
    { path: '/wp-content/plugins/ultimate-member/', type: 'plugin-dir', risk: 'medium', label: 'Ultimate Member' },
    { path: '/wp-content/plugins/wp-gdpr-compliance/', type: 'plugin-dir', risk: 'low', label: 'WP GDPR' },
    { path: '/wp-content/plugins/404-to-301/', type: 'plugin-dir', risk: 'low', label: '404 to 301' },
    { path: '/wp-content/themes/twentytwenty/', type: 'theme-dir', risk: 'info', label: 'TT20 theme' },
    { path: '/wp-content/themes/twentytwentyone/', type: 'theme-dir', risk: 'info', label: 'TT21 theme' },
    { path: '/wp-content/themes/twentytwentytwo/', type: 'theme-dir', risk: 'info', label: 'TT22 theme' },
    { path: '/wp-content/themes/twentytwentythree/', type: 'theme-dir', risk: 'info', label: 'TT23 theme' },
    { path: '/wp-content/themes/twentytwentyfour/', type: 'theme-dir', risk: 'info', label: 'TT24 theme' },
    { path: '/wp-content/themes/twentytwentyfive/', type: 'theme-dir', risk: 'info', label: 'TT25 theme' },
    { path: '/wp-content/themes/astra/', type: 'theme-dir', risk: 'info', label: 'Astra theme' },
    { path: '/wp-content/themes/astra/readme.txt', type: 'theme-file', risk: 'medium', label: 'Astra readme' },
    { path: '/wp-content/themes/generatepress/', type: 'theme-dir', risk: 'info', label: 'GeneratePress' },
    { path: '/wp-content/themes/oceanwp/', type: 'theme-dir', risk: 'info', label: 'OceanWP' },
    { path: '/wp-content/themes/hello-elementor/', type: 'theme-dir', risk: 'info', label: 'Hello Elementor' },
    { path: '/wp-content/themes/storefront/', type: 'theme-dir', risk: 'info', label: 'Storefront' },
    { path: '/wp-content/themes/divi/', type: 'theme-dir', risk: 'info', label: 'Divi theme' },
    { path: '/wp-content/themes/avada/', type: 'theme-dir', risk: 'info', label: 'Avada theme' },
    { path: '/wp-content/themes/betheme/', type: 'theme-dir', risk: 'info', label: 'BeTheme' },
    { path: '/wp-content/themes/Divi/', type: 'theme-dir', risk: 'info', label: 'Divi theme (cap)' },
    { path: '/wp-admin/setup-config.php?step=1', type: 'setup', risk: 'critical', label: 'Setup config step 1' },
    { path: '/wp-admin/setup-config.php?step=2', type: 'setup', risk: 'critical', label: 'Setup config step 2' },
    { path: '/wp-admin/install.php?step=1', type: 'install', risk: 'critical', label: 'Install step 1' },
    { path: '/wp-admin/install.php?step=2', type: 'install', risk: 'critical', label: 'Install step 2' },
    { path: '/phpinfo.php', type: 'info-leak', risk: 'critical', label: 'phpinfo.php' },
    { path: '/info.php', type: 'info-leak', risk: 'critical', label: 'info.php' },
    { path: '/test.php', type: 'info-leak', risk: 'high', label: 'test.php' },
    { path: '/php.php', type: 'info-leak', risk: 'critical', label: 'php.php' },
    { path: '/i.php', type: 'info-leak', risk: 'high', label: 'i.php' },
    { path: '/adminer.php', type: 'info-leak', risk: 'critical', label: 'adminer.php' },
    { path: '/phpmyadmin/', type: 'info-leak', risk: 'critical', label: 'phpMyAdmin' },
    { path: '/pma/', type: 'info-leak', risk: 'critical', label: 'pma dir' },
    { path: '/mysql/', type: 'info-leak', risk: 'critical', label: 'mysql dir' },
    { path: '/wp-json/wp/v2/block-renderer/core/paragraph', type: 'rest-api', risk: 'low', label: 'Block renderer core/paragraph' },
    { path: '/wp-json/wp/v2/block-renderer/core/heading', type: 'rest-api', risk: 'low', label: 'Block renderer core/heading' },
    { path: '/wp-json/wp/v2/block-renderer/core/image', type: 'rest-api', risk: 'low', label: 'Block renderer core/image' },
    { path: '/wp-json/wp/v2/block-renderer/core/embed', type: 'rest-api', risk: 'low', label: 'Block renderer core/embed' },
    { path: '/wp-json/wp/v2/block-renderer/core/html', type: 'rest-api', risk: 'low', label: 'Block renderer core/html' },
    { path: '/wp-json/wp/v2/block-renderer/core/columns', type: 'rest-api', risk: 'low', label: 'Block renderer core/columns' },
    { path: '/wp-json/wp/v2/block-renderer/core/group', type: 'rest-api', risk: 'low', label: 'Block renderer core/group' },
    { path: '/wp-json/wp/v2/block-renderer/core/gallery', type: 'rest-api', risk: 'low', label: 'Block renderer core/gallery' },
    { path: '/wp-cron.php?doing_wp_cron', type: 'cron', risk: 'low', label: 'WP-Cron (query)' },
    { path: '/?doing_wp_cron', type: 'cron', risk: 'low', label: 'WP-Cron (root query)' },
    { path: '/wp-cron.php?doing_wp_cron=1', type: 'cron', risk: 'low', label: 'WP-Cron (query=1)' },
    { path: '/wp-content/uploads/wpforms/', type: 'uploads', risk: 'low', label: 'WPForms uploads' },
    { path: '/wp-content/uploads/woocommerce_uploads/', type: 'uploads', risk: 'low', label: 'WooCommerce uploads' },
    { path: '/wp-content/uploads/wpcf7_uploads/', type: 'uploads', risk: 'low', label: 'CF7 uploads' },
    { path: '/wp-content/uploads/wp-personal-data-exports/', type: 'uploads', risk: 'medium', label: 'WP personal data exports' }
  ]);

  const EXTRA_PATHS = [
    { path: '/wp-admin/admin.php', type: 'admin', risk: 'medium', label: 'Admin dashboard' },
    { path: '/wp-admin/index.php', type: 'admin', risk: 'info', label: 'Admin index' },
    { path: '/wp-admin/options-head.php', type: 'admin', risk: 'low', label: 'Options head' },
    { path: '/wp-admin/options.php?page=options-general', type: 'admin', risk: 'medium', label: 'General options (query)' },
    { path: '/wp-admin/edit-form-advanced.php', type: 'admin', risk: 'low', label: 'Edit form advanced' },
    { path: '/wp-admin/edit-form-comment.php', type: 'admin', risk: 'low', label: 'Edit form comment' },
    { path: '/wp-admin/edit-tag-form.php', type: 'admin', risk: 'low', label: 'Edit tag form' },
    { path: '/wp-admin/edit-comments.php?comment_status=spam', type: 'admin', risk: 'low', label: 'Comments spam' },
    { path: '/wp-admin/edit-comments.php?comment_status=trash', type: 'admin', risk: 'low', label: 'Comments trash' },
    { path: '/wp-admin/press-this.php', type: 'admin', risk: 'low', label: 'Press This' },
    { path: '/wp-admin/admin-header.php', type: 'admin', risk: 'low', label: 'Admin header' },
    { path: '/wp-admin/admin-footer.php', type: 'admin', risk: 'low', label: 'Admin footer' },
    { path: '/wp-admin/menu.php', type: 'admin', risk: 'low', label: 'Admin menu' },
    { path: '/wp-admin/menu-header.php', type: 'admin', risk: 'low', label: 'Admin menu header' },
    { path: '/wp-admin/custom-background.php', type: 'admin', risk: 'low', label: 'Custom background' },
    { path: '/wp-admin/custom-header.php', type: 'admin', risk: 'low', label: 'Custom header' },
    { path: '/wp-admin/er.php', type: 'admin', risk: 'low', label: 'Editor' },
    { path: '/wp-admin/post-new.php?post_type=page', type: 'admin', risk: 'medium', label: 'New page' },
    { path: '/wp-admin/post-new.php?post_type=post', type: 'admin', risk: 'medium', label: 'New post (query)' },
    { path: '/wp-admin/upload.php?mode=list', type: 'admin', risk: 'low', label: 'Uploads list mode' },
    { path: '/wp-admin/upload.php?mode=grid', type: 'admin', risk: 'low', label: 'Uploads grid mode' },
    { path: '/wp-admin/media-upload.php', type: 'admin', risk: 'low', label: 'Media upload' },
    { path: '/wp-admin/media.php', type: 'admin', risk: 'low', label: 'Media page' },
    { path: '/wp-admin/image-edit.php', type: 'admin', risk: 'low', label: 'Image editor' },
    { path: '/wp-admin/ms-edit.php', type: 'multisite', risk: 'medium', label: 'MS Edit' },
    { path: '/wp-admin/ms-sites.php?action=editblog', type: 'multisite', risk: 'medium', label: 'MS Edit blog' },
    { path: '/wp-admin/ms-users.php?action=edit', type: 'multisite', risk: 'medium', label: 'MS Edit user' },
    { path: '/wp-admin/update-core.php?force-check=1', type: 'admin', risk: 'medium', label: 'Force core check' },
    { path: '/wp-admin/plugin-install.php?tab=upload', type: 'admin', risk: 'medium', label: 'Plugin upload' },
    { path: '/wp-admin/theme-install.php?tab=upload', type: 'admin', risk: 'medium', label: 'Theme upload' },
    { path: '/wp-admin/includes/plugin.php', type: 'dir', risk: 'low', label: 'Includes plugin.php' },
    { path: '/wp-admin/includes/update.php', type: 'dir', risk: 'low', label: 'Includes update.php' },
    { path: '/wp-admin/includes/file.php', type: 'dir', risk: 'low', label: 'Includes file.php' },
    { path: '/wp-admin/includes/user.php', type: 'dir', risk: 'low', label: 'Includes user.php' },
    { path: '/wp-admin/includes/class-wp-list-table.php', type: 'dir', risk: 'low', label: 'WP List Table' },
    { path: '/wp-admin/user/', type: 'admin', risk: 'low', label: 'User admin dir' },
    { path: '/wp-admin/user/admin.php', type: 'admin', risk: 'low', label: 'User admin' },
    { path: '/wp-admin/user/menu.php', type: 'admin', risk: 'low', label: 'User menu' },
    { path: '/wp-admin/user/profile.php', type: 'admin', risk: 'low', label: 'User profile' },
    { path: '/wp-admin/user/user-edit.php', type: 'admin', risk: 'low', label: 'User edit (subdir)' },
    { path: '/wp-admin/user-edit.php?user_id=1', type: 'admin', risk: 'medium', label: 'User edit ID=1' },
    { path: '/wp-admin/async-upload.php?action=upload-attachment', type: 'admin-ajax', risk: 'medium', label: 'Async upload (action)' },
    { path: '/wp-admin/admin-ajax.php?action=heartbeat', type: 'admin-ajax', risk: 'low', label: 'Admin AJAX heartbeat' },
    { path: '/wp-admin/admin-ajax.php?action=query-attachments', type: 'admin-ajax', risk: 'low', label: 'Admin AJAX query attachments' },
    { path: '/wp-admin/admin-ajax.php?action=get-comments-page', type: 'admin-ajax', risk: 'low', label: 'Admin AJAX get comments' },
    { path: '/wp-admin/admin-post.php?action=editpost', type: 'admin-post', risk: 'low', label: 'Admin POST editpost' },
    { path: '/wp-admin/network/admin.php', type: 'multisite', risk: 'medium', label: 'Network admin' },
    { path: '/wp-admin/network/index.php', type: 'multisite', risk: 'medium', label: 'Network index' },
    { path: '/wp-admin/network/menu.php', type: 'multisite', risk: 'medium', label: 'Network menu' },
    { path: '/wp-admin/network/settings.php', type: 'multisite', risk: 'high', label: 'Network settings' },
    { path: '/wp-admin/network/update-core.php', type: 'multisite', risk: 'medium', label: 'Network update core' },
    { path: '/wp-admin/network/theme-editor.php', type: 'multisite', risk: 'high', label: 'Network theme editor' },
    { path: '/wp-admin/network/plugin-editor.php', type: 'multisite', risk: 'high', label: 'Network plugin editor' },
    { path: '/wp-admin/network/themes.php', type: 'multisite', risk: 'medium', label: 'Network themes' },
    { path: '/wp-admin/network/plugins.php', type: 'multisite', risk: 'medium', label: 'Network plugins' },
    { path: '/wp-admin/network/users.php', type: 'multisite', risk: 'high', label: 'Network users' },
    { path: '/wp-admin/network/user-new.php', type: 'multisite', risk: 'high', label: 'Network new user' },
    { path: '/wp-admin/network/site-new.php', type: 'multisite', risk: 'high', label: 'Network new site' },
    { path: '/wp-admin/network/site-info.php', type: 'multisite', risk: 'high', label: 'Network site info' },
    { path: '/wp-admin/network/site-themes.php', type: 'multisite', risk: 'medium', label: 'Network site themes' },
    { path: '/wp-admin/network/site-users.php', type: 'multisite', risk: 'high', label: 'Network site users' },
    { path: '/wp-admin/network/sites.php', type: 'multisite', risk: 'high', label: 'Network sites' },
    { path: '/wp-content/index.php', type: 'dir', risk: 'low', label: 'wp-content index' },
    { path: '/wp-content/plugins/index.php', type: 'dir', risk: 'info', label: 'Plugins index' },
    { path: '/wp-content/themes/index.php', type: 'dir', risk: 'info', label: 'Themes index' },
    { path: '/wp-content/uploads/index.php', type: 'dir', risk: 'low', label: 'Uploads index' },
    { path: '/wp-content/uploads/.htaccess', type: 'config', risk: 'medium', label: 'Uploads .htaccess' },
    { path: '/wp-content/uploads/.htpasswd', type: 'config', risk: 'critical', label: 'Uploads .htpasswd' },
    { path: '/wp-content/uploads/passwd.txt', type: 'backup', risk: 'critical', label: 'Uploads passwd.txt' },
    { path: '/wp-content/uploads/users.txt', type: 'backup', risk: 'high', label: 'Uploads users.txt' },
    { path: '/wp-content/uploads/accounts.txt', type: 'backup', risk: 'high', label: 'Uploads accounts.txt' },
    { path: '/wp-content/upgrade/readme.txt', type: 'version-disclosure', risk: 'low', label: 'Upgrade readme' },
    { path: '/wp-content/updraft/', type: 'backup', risk: 'critical', label: 'UpdraftPlus dir' },
    { path: '/wp-content/ai1wm-backups/', type: 'backup', risk: 'critical', label: 'All-in-One WP Migration' },
    { path: '/wp-content/ai1wm-backups/index.php', type: 'backup', risk: 'high', label: 'AI1WM index' },
    { path: '/wp-content/backupwordpress/', type: 'backup', risk: 'critical', label: 'BackupWordPress dir' },
    { path: '/wp-content/backwpup-*', type: 'backup', risk: 'critical', label: 'BackWPup dir' },
    { path: '/wp-content/wpvivid-backups/', type: 'backup', risk: 'critical', label: 'WPvivid backups' },
    { path: '/wp-content/w3tc-config/', type: 'config', risk: 'high', label: 'W3TC config dir' },
    { path: '/wp-content/et-cache/', type: 'dir', risk: 'low', label: 'Elegant Themes cache' },
    { path: '/wp-content/mysql.sql', type: 'backup', risk: 'critical', label: 'wp-content mysql.sql' },
    { path: '/wp-content/wp-config.php.save', type: 'backup', risk: 'critical', label: 'wp-content config save' },
    { path: '/wp-content/wp-config-sample.php', type: 'backup', risk: 'high', label: 'wp-content config sample' },
    { path: '/wp-content/plugins/akismet/class.akismet.php', type: 'plugin-file', risk: 'low', label: 'Akismet main file' },
    { path: '/wp-content/plugins/jetpack/jetpack.php', type: 'plugin-file', risk: 'low', label: 'Jetpack main file' },
    { path: '/wp-content/plugins/woocommerce/woocommerce.php', type: 'plugin-file', risk: 'low', label: 'WooCommerce main file' },
    { path: '/wp-content/plugins/woocommerce/assets/', type: 'plugin-dir', risk: 'low', label: 'WooCommerce assets' },
    { path: '/wp-content/plugins/woocommerce/includes/', type: 'plugin-dir', risk: 'low', label: 'WooCommerce includes' },
    { path: '/wp-content/plugins/woocommerce/templates/', type: 'plugin-dir', risk: 'low', label: 'WooCommerce templates' },
    { path: '/wp-content/plugins/contact-form-7/wp-contact-form-7.php', type: 'plugin-file', risk: 'low', label: 'CF7 main file' },
    { path: '/wp-content/plugins/contact-form-7/includes/', type: 'plugin-dir', risk: 'low', label: 'CF7 includes' },
    { path: '/wp-content/plugins/wordfence/lib/', type: 'plugin-dir', risk: 'low', label: 'Wordfence lib' },
    { path: '/wp-content/plugins/wordfence/waf/', type: 'plugin-dir', risk: 'low', label: 'Wordfence WAF' },
    { path: '/wp-content/plugins/wordfence/tmp/', type: 'plugin-dir', risk: 'medium', label: 'Wordfence tmp' },
    { path: '/wp-content/wflogs/', type: 'plugin-dir', risk: 'medium', label: 'Wordfence logs' },
    { path: '/wp-content/wflogs/config.php', type: 'plugin-file', risk: 'medium', label: 'Wordfence config' },
    { path: '/wp-content/plugins/elementor/includes/', type: 'plugin-dir', risk: 'low', label: 'Elementor includes' },
    { path: '/wp-content/plugins/elementor/assets/', type: 'plugin-dir', risk: 'low', label: 'Elementor assets' },
    { path: '/wp-content/plugins/elementor-pro/', type: 'plugin-dir', risk: 'medium', label: 'Elementor Pro' },
    { path: '/wp-content/plugins/elementor-pro/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Elementor Pro readme' },
    { path: '/wp-content/plugins/wordpress-seo/wp-seo.php', type: 'plugin-file', risk: 'low', label: 'Yoast main file' },
    { path: '/wp-content/plugins/wordpress-seo/admin/', type: 'plugin-dir', risk: 'low', label: 'Yoast admin' },
    { path: '/wp-content/plugins/wordpress-seo/frontend/', type: 'plugin-dir', risk: 'low', label: 'Yoast frontend' },
    { path: '/wp-content/plugins/classic-editor/', type: 'plugin-dir', risk: 'low', label: 'Classic Editor' },
    { path: '/wp-content/plugins/classic-editor/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Classic Editor readme' },
    { path: '/wp-content/plugins/gutenberg/', type: 'plugin-dir', risk: 'low', label: 'Gutenberg plugin' },
    { path: '/wp-content/plugins/wpforms-lite/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WPForms readme' },
    { path: '/wp-content/plugins/wpforms-lite/assets/', type: 'plugin-dir', risk: 'low', label: 'WPForms assets' },
    { path: '/wp-content/plugins/ninja-forms/', type: 'plugin-dir', risk: 'low', label: 'Ninja Forms' },
    { path: '/wp-content/plugins/ninja-forms/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Ninja Forms readme' },
    { path: '/wp-content/plugins/wp-mail-smtp/', type: 'plugin-dir', risk: 'low', label: 'WP Mail SMTP' },
    { path: '/wp-content/plugins/wp-mail-smtp/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WP Mail SMTP readme' },
    { path: '/wp-content/plugins/sucuri-scanner/', type: 'plugin-dir', risk: 'low', label: 'Sucuri scanner' },
    { path: '/wp-content/plugins/sucuri-scanner/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Sucuri readme' },
    { path: '/wp-content/plugins/limit-login-attempts/', type: 'plugin-dir', risk: 'low', label: 'Limit Login Attempts' },
    { path: '/wp-content/plugins/limit-login-attempts-reloaded/', type: 'plugin-dir', risk: 'low', label: 'LLA Reloaded' },
    { path: '/wp-content/plugins/simple-history/', type: 'plugin-dir', risk: 'low', label: 'Simple History' },
    { path: '/wp-content/plugins/disable-comments/', type: 'plugin-dir', risk: 'low', label: 'Disable Comments' },
    { path: '/wp-content/plugins/all-in-one-wp-migration/', type: 'plugin-dir', risk: 'medium', label: 'AIOWPM plugin' },
    { path: '/wp-content/plugins/all-in-one-wp-migration/storage/', type: 'backup', risk: 'critical', label: 'AIOWPM storage' },
    { path: '/wp-content/plugins/all-in-one-wp-migration/readme.txt', type: 'plugin-file', risk: 'medium', label: 'AIOWPM readme' },
    { path: '/wp-content/plugins/backup-backup/', type: 'plugin-dir', risk: 'medium', label: 'Backup & Backup' },
    { path: '/wp-content/plugins/blogvault-real-time-backup/', type: 'plugin-dir', risk: 'low', label: 'BlogVault' },
    { path: '/wp-content/plugins/broken-link-checker/', type: 'plugin-dir', risk: 'low', label: 'Broken Link Checker' },
    { path: '/wp-content/plugins/google-analytics-for-wordpress/', type: 'plugin-dir', risk: 'low', label: 'MonsterInsights' },
    { path: '/wp-content/plugins/google-sitemap-generator/', type: 'plugin-dir', risk: 'low', label: 'Google Sitemap Gen' },
    { path: '/wp-content/plugins/instagram-feed/', type: 'plugin-dir', risk: 'low', label: 'Instagram Feed' },
    { path: '/wp-content/plugins/postman-smtp/', type: 'plugin-dir', risk: 'low', label: 'Postman SMTP' },
    { path: '/wp-content/plugins/tablepress/', type: 'plugin-dir', risk: 'low', label: 'TablePress' },
    { path: '/wp-content/plugins/tinymce-advanced/', type: 'plugin-dir', risk: 'low', label: 'TinyMCE Advanced' },
    { path: '/wp-content/plugins/w3-total-cache/readme.txt', type: 'plugin-file', risk: 'medium', label: 'W3TC readme' },
    { path: '/wp-content/plugins/w3-total-cache/ini/', type: 'plugin-dir', risk: 'low', label: 'W3TC ini' },
    { path: '/wp-content/plugins/wordfence/wordfence.php', type: 'plugin-file', risk: 'low', label: 'Wordfence main' },
    { path: '/wp-content/plugins/wp-optimize/', type: 'plugin-dir', risk: 'low', label: 'WP-Optimize' },
    { path: '/wp-content/plugins/wp-super-cache/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WP Super Cache readme' },
    { path: '/wp-content/plugins/wp-rocket/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WP Rocket readme' },
    { path: '/wp-content/plugins/wp-all-import/', type: 'plugin-dir', risk: 'medium', label: 'WP All Import' },
    { path: '/wp-content/plugins/wp-all-export/', type: 'plugin-dir', risk: 'medium', label: 'WP All Export' },
    { path: '/wp-content/plugins/wpdatatables/', type: 'plugin-dir', risk: 'medium', label: 'wpDataTables' },
    { path: '/wp-content/plugins/worker/', type: 'plugin-dir', risk: 'medium', label: 'Worker plugin (MalCare)' },
    { path: '/wp-content/plugins/wp-crontrol/', type: 'plugin-dir', risk: 'medium', label: 'WP Crontrol' },
    { path: '/wp-content/plugins/file-manager-advanced/', type: 'plugin-dir', risk: 'high', label: 'File Manager Advanced' },
    { path: '/wp-content/plugins/file-manager-advanced/readme.txt', type: 'plugin-file', risk: 'medium', label: 'File Manager Advanced readme' },
    { path: '/wp-content/plugins/wp-file-manager-pro/', type: 'plugin-dir', risk: 'high', label: 'WP File Manager Pro' },
    { path: '/wp-content/plugins/wp-file-manager-pro/lib/php/connector.minimal.php', type: 'plugin-file', risk: 'critical', label: 'WPFM Pro connector' },
    { path: '/wp-content/plugins/file-manager/', type: 'plugin-dir', risk: 'high', label: 'File Manager plugin' },
    { path: '/wp-content/plugins/file-manager/lib/php/connector.minimal.php', type: 'plugin-file', risk: 'critical', label: 'File Manager connector' },
    { path: '/wp-content/plugins/dokan-lite/', type: 'plugin-dir', risk: 'low', label: 'Dokan Lite' },
    { path: '/wp-content/plugins/dokan-pro/', type: 'plugin-dir', risk: 'low', label: 'Dokan Pro' },
    { path: '/wp-content/plugins/wpml-string-translation/', type: 'plugin-dir', risk: 'low', label: 'WPML String Translation' },
    { path: '/wp-content/plugins/sitepress-multilingual-cms/', type: 'plugin-dir', risk: 'low', label: 'WPML CMS' },
    { path: '/wp-content/plugins/polylang/', type: 'plugin-dir', risk: 'low', label: 'Polylang' },
    { path: '/wp-content/plugins/wp-fastest-cache/', type: 'plugin-dir', risk: 'low', label: 'WP Fastest Cache' },
    { path: '/wp-content/plugins/litespeed-cache/', type: 'plugin-dir', risk: 'low', label: 'LiteSpeed Cache' },
    { path: '/wp-content/plugins/optimus/', type: 'plugin-dir', risk: 'low', label: 'Optimus' },
    { path: '/wp-content/plugins/tiny-compress-images/', type: 'plugin-dir', risk: 'low', label: 'TinyPNG' },
    { path: '/wp-content/plugins/smush-it/', type: 'plugin-dir', risk: 'low', label: 'Smush' },
    { path: '/wp-content/plugins/ewww-image-optimizer/', type: 'plugin-dir', risk: 'low', label: 'EWWW Image Optimizer' },
    { path: '/wp-content/plugins/shortpixel-image-optimiser/', type: 'plugin-dir', risk: 'low', label: 'ShortPixel' },
    { path: '/wp-content/plugins/imagify/', type: 'plugin-dir', risk: 'low', label: 'Imagify' },
    { path: '/wp-content/plugins/rocket-lazy-load/', type: 'plugin-dir', risk: 'low', label: 'Rocket Lazy Load' },
    { path: '/wp-content/plugins/amp/', type: 'plugin-dir', risk: 'low', label: 'AMP' },
    { path: '/wp-content/plugins/amp/readme.txt', type: 'plugin-file', risk: 'medium', label: 'AMP readme' },
    { path: '/wp-content/plugins/wpforms/', type: 'plugin-dir', risk: 'low', label: 'WPForms Pro' },
    { path: '/wp-content/plugins/wpforms/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WPForms Pro readme' },
    { path: '/wp-content/plugins/wpbakery-page-builder/', type: 'plugin-dir', risk: 'medium', label: 'WPBakery Page Builder' },
    { path: '/wp-content/plugins/wpbakery-page-builder/readme.txt', type: 'plugin-file', risk: 'medium', label: 'WPBakery readme' },
    { path: '/wp-content/plugins/revslider/revslider.php', type: 'plugin-file', risk: 'medium', label: 'RevSlider main file' },
    { path: '/wp-content/plugins/revslider/readme.txt', type: 'plugin-file', risk: 'medium', label: 'RevSlider readme' },
    { path: '/wp-content/plugins/revslider/admin/', type: 'plugin-dir', risk: 'medium', label: 'RevSlider admin' },
    { path: '/wp-content/plugins/revslider/includes/', type: 'plugin-dir', risk: 'medium', label: 'RevSlider includes' },
    { path: '/wp-content/plugins/layerslider/', type: 'plugin-dir', risk: 'medium', label: 'LayerSlider' },
    { path: '/wp-content/plugins/layerslider/readme.txt', type: 'plugin-file', risk: 'medium', label: 'LayerSlider readme' },
    { path: '/wp-content/plugins/js_composer/readme.txt', type: 'plugin-file', risk: 'medium', label: 'JS Composer readme' },
    { path: '/wp-content/plugins/js_composer/include/', type: 'plugin-dir', risk: 'medium', label: 'JS Composer include' },
    { path: '/wp-content/plugins/unyson/', type: 'plugin-dir', risk: 'medium', label: 'Unyson' },
    { path: '/wp-content/plugins/unyson/readme.txt', type: 'plugin-file', risk: 'medium', label: 'Unyson readme' },
    { path: '/wp-content/plugins/cherry-plugin/', type: 'plugin-dir', risk: 'low', label: 'Cherry Plugin' },
    { path: '/wp-content/plugins/instagram-slider-widget/', type: 'plugin-dir', risk: 'low', label: 'Instagram Slider' },
    { path: '/wp-content/plugins/contact-form-7-mailchimp-extension/', type: 'plugin-dir', risk: 'low', label: 'CF7 Mailchimp' },
    { path: '/wp-content/plugins/wp-google-maps/', type: 'plugin-dir', risk: 'low', label: 'WP Google Maps' },
    { path: '/wp-content/plugins/leaflet-maps-marker/', type: 'plugin-dir', risk: 'low', label: 'Leaflet Maps Marker' },
    { path: '/wp-content/plugins/under-construction-page/', type: 'plugin-dir', risk: 'low', label: 'Under Construction' },
    { path: '/wp-content/plugins/coming-soon/', type: 'plugin-dir', risk: 'low', label: 'Coming Soon' },
    { path: '/wp-content/plugins/duplicator-pro/', type: 'plugin-dir', risk: 'high', label: 'Duplicator Pro' },
    { path: '/wp-content/plugins/duplicator-pro/installer.php', type: 'plugin-file', risk: 'critical', label: 'Duplicator Pro installer' },
    { path: '/wp-content/plugins/wp-migrate-db/', type: 'plugin-dir', risk: 'medium', label: 'WP Migrate DB' },
    { path: '/wp-content/plugins/wp-migrate-db-pro/', type: 'plugin-dir', risk: 'medium', label: 'WP Migrate DB Pro' },
    { path: '/wp-content/plugins/better-wp-security/', type: 'plugin-dir', risk: 'medium', label: 'iThemes Security' },
    { path: '/wp-content/plugins/better-wp-security/readme.txt', type: 'plugin-file', risk: 'medium', label: 'iThemes Security readme' },
    { path: '/wp-content/plugins/defender-security/', type: 'plugin-dir', risk: 'low', label: 'Defender Security' },
    { path: '/wp-content/plugins/security-ninja/', type: 'plugin-dir', risk: 'low', label: 'Security Ninja' },
    { path: '/wp-content/plugins/all-in-one-wp-security-and-firewall/', type: 'plugin-dir', risk: 'low', label: 'AIOS Firewall' },
    { path: '/wp-content/plugins/jetpack/modules/', type: 'plugin-dir', risk: 'low', label: 'Jetpack modules' },
    { path: '/wp-content/plugins/jetpack/vendor/', type: 'plugin-dir', risk: 'low', label: 'Jetpack vendor' },
    { path: '/wp-content/plugins/wp-statistics/', type: 'plugin-dir', risk: 'low', label: 'WP Statistics' },
    { path: '/wp-content/plugins/google-analytics-dashboard-for-wp/', type: 'plugin-dir', risk: 'low', label: 'GADWP' },
    { path: '/wp-content/plugins/wpforms-lite/includes/', type: 'plugin-dir', risk: 'low', label: 'WPForms includes' },
    { path: '/wp-content/themes/twentytwenty/style.css', type: 'theme-file', risk: 'low', label: 'TT20 style.css' },
    { path: '/wp-content/themes/twentytwenty/functions.php', type: 'theme-file', risk: 'low', label: 'TT20 functions.php' },
    { path: '/wp-content/themes/twentytwentyone/style.css', type: 'theme-file', risk: 'low', label: 'TT21 style.css' },
    { path: '/wp-content/themes/twentytwentytwo/style.css', type: 'theme-file', risk: 'low', label: 'TT22 style.css' },
    { path: '/wp-content/themes/astra/functions.php', type: 'theme-file', risk: 'low', label: 'Astra functions.php' },
    { path: '/wp-content/themes/astra/changelog.txt', type: 'theme-file', risk: 'medium', label: 'Astra changelog' },
    { path: '/wp-content/themes/generatepress/style.css', type: 'theme-file', risk: 'low', label: 'GeneratePress style.css' },
    { path: '/wp-content/themes/generatepress/readme.txt', type: 'theme-file', risk: 'medium', label: 'GeneratePress readme' },
    { path: '/wp-content/themes/oceanwp/style.css', type: 'theme-file', risk: 'low', label: 'OceanWP style.css' },
    { path: '/wp-content/themes/oceanwp/readme.txt', type: 'theme-file', risk: 'medium', label: 'OceanWP readme' },
    { path: '/wp-content/themes/hello-elementor/style.css', type: 'theme-file', risk: 'low', label: 'Hello Elementor style.css' },
    { path: '/wp-content/themes/hello-elementor/readme.txt', type: 'theme-file', risk: 'medium', label: 'Hello Elementor readme' },
    { path: '/wp-content/themes/storefront/style.css', type: 'theme-file', risk: 'low', label: 'Storefront style.css' },
    { path: '/wp-content/themes/storefront/readme.txt', type: 'theme-file', risk: 'medium', label: 'Storefront readme' },
    { path: '/wp-content/themes/divi/style.css', type: 'theme-file', risk: 'low', label: 'Divi style.css' },
    { path: '/wp-content/themes/Divi/style.css', type: 'theme-file', risk: 'low', label: 'Divi (cap) style.css' },
    { path: '/wp-content/themes/avada/style.css', type: 'theme-file', risk: 'low', label: 'Avada style.css' },
    { path: '/wp-content/themes/betheme/style.css', type: 'theme-file', risk: 'low', label: 'BeTheme style.css' },
    { path: '/wp-content/themes/betheme/readme.txt', type: 'theme-file', risk: 'medium', label: 'BeTheme readme' },
    { path: '/wp-content/themes/flatsome/', type: 'theme-dir', risk: 'info', label: 'Flatsome theme' },
    { path: '/wp-content/themes/flatsome/style.css', type: 'theme-file', risk: 'low', label: 'Flatsome style.css' },
    { path: '/wp-content/themes/enfold/', type: 'theme-dir', risk: 'info', label: 'Enfold theme' },
    { path: '/wp-content/themes/enfold/style.css', type: 'theme-file', risk: 'low', label: 'Enfold style.css' },
    { path: '/wp-content/themes/salient/', type: 'theme-dir', risk: 'info', label: 'Salient theme' },
    { path: '/wp-content/themes/salient/style.css', type: 'theme-file', risk: 'low', label: 'Salient style.css' },
    { path: '/wp-content/themes/woodmart/', type: 'theme-dir', risk: 'info', label: 'WoodMart theme' },
    { path: '/wp-content/themes/woodmart/style.css', type: 'theme-file', risk: 'low', label: 'WoodMart style.css' },
    { path: '/wp-content/themes/porto/', type: 'theme-dir', risk: 'info', label: 'Porto theme' },
    { path: '/wp-content/themes/porto/style.css', type: 'theme-file', risk: 'low', label: 'Porto style.css' },
    { path: '/wp-content/themes/twentynineteen/', type: 'theme-dir', risk: 'info', label: 'TT19 theme' },
    { path: '/wp-content/themes/twentyseventeen/', type: 'theme-dir', risk: 'info', label: 'TT17 theme' },
    { path: '/wp-content/themes/twentysixteen/', type: 'theme-dir', risk: 'info', label: 'TT16 theme' },
    { path: '/wp-content/themes/twentyfifteen/', type: 'theme-dir', risk: 'info', label: 'TT15 theme' },
    { path: '/wp-includes/classes.php', type: 'core', risk: 'low', label: 'classes.php' },
    { path: '/wp-includes/comment.php', type: 'core', risk: 'low', label: 'comment.php' },
    { path: '/wp-includes/formatting.php', type: 'core', risk: 'low', label: 'formatting.php' },
    { path: '/wp-includes/general-template.php', type: 'core', risk: 'low', label: 'general-template.php' },
    { path: '/wp-includes/link-template.php', type: 'core', risk: 'low', label: 'link-template.php' },
    { path: '/wp-includes/media.php', type: 'core', risk: 'low', label: 'media.php' },
    { path: '/wp-includes/meta.php', type: 'core', risk: 'low', label: 'meta.php' },
    { path: '/wp-includes/nav-menu.php', type: 'core', risk: 'low', label: 'nav-menu.php' },
    { path: '/wp-includes/nav-menu-template.php', type: 'core', risk: 'low', label: 'nav-menu-template.php' },
    { path: '/wp-includes/option.php', type: 'core', risk: 'low', label: 'option.php' },
    { path: '/wp-includes/pluggable-deprecated.php', type: 'core', risk: 'low', label: 'pluggable-deprecated.php' },
    { path: '/wp-includes/plugin.php', type: 'core', risk: 'low', label: 'plugin.php (core)' },
    { path: '/wp-includes/post.php', type: 'core', risk: 'low', label: 'post.php (core)' },
    { path: '/wp-includes/post-template.php', type: 'core', risk: 'low', label: 'post-template.php' },
    { path: '/wp-includes/query.php', type: 'core', risk: 'low', label: 'query.php' },
    { path: '/wp-includes/rewrite.php', type: 'core', risk: 'low', label: 'rewrite.php' },
    { path: '/wp-includes/script-loader.php', type: 'core', risk: 'low', label: 'script-loader.php' },
    { path: '/wp-includes/shortcodes.php', type: 'core', risk: 'low', label: 'shortcodes.php' },
    { path: '/wp-includes/taxonomy.php', type: 'core', risk: 'low', label: 'taxonomy.php' },
    { path: '/wp-includes/theme.php', type: 'core', risk: 'low', label: 'theme.php' },
    { path: '/wp-includes/update.php', type: 'core', risk: 'low', label: 'update.php (core)' },
    { path: '/wp-includes/widgets.php', type: 'core', risk: 'low', label: 'widgets.php' },
    { path: '/wp-includes/wp-db.php.bak', type: 'backup', risk: 'critical', label: 'wp-db.php.bak' },
    { path: '/wp-includes/Text/', type: 'dir', risk: 'low', label: 'Text lib dir' },
    { path: '/wp-includes/blocks/', type: 'dir', risk: 'info', label: 'Blocks dir' },
    { path: '/wp-includes/block-patterns/', type: 'dir', risk: 'info', label: 'Block patterns dir' },
    { path: '/wp-includes/block-supports/', type: 'dir', risk: 'info', label: 'Block supports dir' },
    { path: '/wp-includes/sodium_compat/', type: 'dir', risk: 'low', label: 'Sodium compat' },
    { path: '/wp-includes/pomo/', type: 'dir', risk: 'low', label: 'POMO lib' },
    { path: '/wp-includes/random_compat/', type: 'dir', risk: 'low', label: 'Random compat' },
    { path: '/.user.ini', type: 'config', risk: 'high', label: '.user.ini' },
    { path: '/.user.ini.bak', type: 'backup', risk: 'high', label: '.user.ini.bak' },
    { path: '/php.ini', type: 'config', risk: 'high', label: 'php.ini' },
    { path: '/php.ini.bak', type: 'backup', risk: 'high', label: 'php.ini.bak' },
    { path: '/php_errorlog', type: 'log', risk: 'high', label: 'php_errorlog' },
    { path: '/cgi-bin/', type: 'dir', risk: 'medium', label: 'cgi-bin dir' },
    { path: '/cgi-bin/php', type: 'info-leak', risk: 'high', label: 'cgi-bin php' },
    { path: '/server-status', type: 'info-leak', risk: 'high', label: 'Apache server-status' },
    { path: '/server-info', type: 'info-leak', risk: 'high', label: 'Apache server-info' },
    { path: '/.well-known/change-password', type: 'security', risk: 'info', label: 'change-password' },
    { path: '/crossdomain.xml', type: 'config', risk: 'medium', label: 'crossdomain.xml' },
    { path: '/clientaccesspolicy.xml', type: 'config', risk: 'medium', label: 'clientaccesspolicy.xml' },
    { path: '/wp-links-opml.php', type: 'opml', risk: 'low', label: 'Links OPML (dup)' },
    { path: '/wp-trackback.php?tb_id=1', type: 'trackback', risk: 'low', label: 'Trackback tb_id=1' },
    { path: '/feed/rss2', type: 'feed', risk: 'info', label: 'Feed rss2 (no slash)' },
    { path: '/feed/atom', type: 'feed', risk: 'info', label: 'Feed atom (no slash)' },
    { path: '/feed/rss', type: 'feed', risk: 'info', label: 'Feed rss (no slash)' },
    { path: '/feed/rdf', type: 'feed', risk: 'info', label: 'Feed rdf (no slash)' },
    { path: '/feed/', type: 'feed', risk: 'info', label: 'Feed (dup)' },
    { path: '/?s=admin', type: 'search', risk: 'low', label: 'Search query admin' },
    { path: '/?s=password', type: 'search', risk: 'low', label: 'Search query password' },
    { path: '/?p=1', type: 'post', risk: 'info', label: 'Post ID 1' },
    { path: '/?page_id=2', type: 'page', risk: 'info', label: 'Page ID 2' },
    { path: '/?attachment_id=1', type: 'attachment', risk: 'low', label: 'Attachment ID 1' },
    { path: '/wp-admin/admin-ajax.php?action=revslider_show_image', type: 'admin-ajax', risk: 'high', label: 'RevSlider AJAX' },
    { path: '/wp-content/plugins/revslider/temp/', type: 'plugin-dir', risk: 'medium', label: 'RevSlider temp' },
    { path: '/wp-content/uploads/revslider/', type: 'uploads', risk: 'medium', label: 'RevSlider uploads' },
    { path: '/wp-content/uploads/revslider/templates/', type: 'uploads', risk: 'medium', label: 'RevSlider templates' },
    { path: '/wp-content/uploads/wp_all_import/', type: 'uploads', risk: 'medium', label: 'WP All Import uploads' },
    { path: '/wp-content/uploads/gravity_forms/', type: 'uploads', risk: 'high', label: 'Gravity Forms uploads' },
    { path: '/wp-content/uploads/smush/', type: 'uploads', risk: 'low', label: 'Smush cache' },
    { path: '/wp-content/uploads/elementor/', type: 'uploads', risk: 'low', label: 'Elementor uploads' },
    { path: '/wp-content/uploads/et_temp/', type: 'uploads', risk: 'low', label: 'ET Temp uploads' },
    { path: '/wp-content/uploads/sites/', type: 'uploads', risk: 'low', label: 'Multisite uploads' },
    { path: '/wp-content/uploads/2023/', type: 'uploads', risk: 'low', label: 'Uploads 2023' },
    { path: '/wp-content/uploads/2022/', type: 'uploads', risk: 'low', label: 'Uploads 2022' },
    { path: '/wp-content/uploads/2021/', type: 'uploads', risk: 'low', label: 'Uploads 2021' },
    { path: '/wp-content/cache/', type: 'dir', risk: 'low', label: 'Cache dir (dup)' },
    { path: '/wp-content/et-cache/', type: 'dir', risk: 'low', label: 'ET Cache' },
    { path: '/wp-content/plugins/.htaccess', type: 'config', risk: 'medium', label: 'Plugins .htaccess' },
    { path: '/wp-content/themes/.htaccess', type: 'config', risk: 'medium', label: 'Themes .htaccess' },
    { path: '/wp-content/uploads/wpcf7_captcha/', type: 'uploads', risk: 'medium', label: 'CF7 Captcha' },
    { path: '/wp-content/uploads/wpcf7_uploads/', type: 'uploads', risk: 'medium', label: 'CF7 uploads' },
    { path: '/wp-content/advanced-cache.php.bak', type: 'backup', risk: 'high', label: 'Advanced cache backup' },
    { path: '/wp-content/object-cache.php.bak', type: 'backup', risk: 'high', label: 'Object cache backup' },
    { path: '/wp-content/db.php.bak', type: 'backup', risk: 'critical', label: 'DB drop-in backup' },
    { path: '/wp-content/plugins/wp-config.php', type: 'backup', risk: 'critical', label: 'Config in plugins' },
    { path: '/wp-content/uploads/wp-config.php', type: 'backup', risk: 'critical', label: 'Config in uploads' },
    { path: '/wp-content/cache/wp-config.php', type: 'backup', risk: 'critical', label: 'Config in cache' },
    { path: '/wp-config.old.php', type: 'backup', risk: 'critical', label: 'wp-config.old.php' },
    { path: '/wp-config.new.php', type: 'backup', risk: 'critical', label: 'wp-config.new.php' },
    { path: '/wp-config.test.php', type: 'backup', risk: 'critical', label: 'wp-config.test.php' },
    { path: '/wp-config.dev.php', type: 'backup', risk: 'critical', label: 'wp-config.dev.php' },
    { path: '/wp-config.staging.php', type: 'backup', risk: 'critical', label: 'wp-config.staging.php' },
    { path: '/wp-config.production.php', type: 'backup', risk: 'critical', label: 'wp-config.production.php' },
    { path: '/wp-config.php_', type: 'backup', risk: 'critical', label: 'wp-config.php_' },
    { path: '/wp-config.php-', type: 'backup', risk: 'critical', label: 'wp-config.php-' },
    { path: '/wp-config.php.bak2', type: 'backup', risk: 'critical', label: 'wp-config.php.bak2' },
    { path: '/wp-config.php.old2', type: 'backup', risk: 'critical', label: 'wp-config.php.old2' },
    { path: '/wp-config.php.2018', type: 'backup', risk: 'critical', label: 'wp-config.php.2018' },
    { path: '/wp-config.php.2019', type: 'backup', risk: 'critical', label: 'wp-config.php.2019' },
    { path: '/wp-config.php.2020', type: 'backup', risk: 'critical', label: 'wp-config.php.2020' },
    { path: '/wp-config.php.2021', type: 'backup', risk: 'critical', label: 'wp-config.php.2021' },
    { path: '/wp-config.php.2022', type: 'backup', risk: 'critical', label: 'wp-config.php.2022' },
    { path: '/wp-config.php.2023', type: 'backup', risk: 'critical', label: 'wp-config.php.2023' },
    { path: '/wp-config.php.2024', type: 'backup', risk: 'critical', label: 'wp-config.php.2024' },
    { path: '/wp-config.php.2025', type: 'backup', risk: 'critical', label: 'wp-config.php.2025' },
    { path: '/wp-config.php.current', type: 'backup', risk: 'critical', label: 'wp-config.php.current' },
    { path: '/wp-config.php.latest', type: 'backup', risk: 'critical', label: 'wp-config.php.latest' },
    { path: '/wp-config.php.backup2', type: 'backup', risk: 'critical', label: 'wp-config.php.backup2' },
    { path: '/wp-config.php.sql', type: 'backup', risk: 'critical', label: 'wp-config.php.sql' },
    { path: '/wp-config.php.bkp2', type: 'backup', risk: 'critical', label: 'wp-config.php.bkp2' },
    { path: '/wp-config.php.orig2', type: 'backup', risk: 'critical', label: 'wp-config.php.orig2' },
    { path: '/wp-config.php.copy2', type: 'backup', risk: 'critical', label: 'wp-config.php.copy2' },
    { path: '/wp-config.php.temp', type: 'backup', risk: 'critical', label: 'wp-config.php.temp' },
    { path: '/wp-config.php.tmp', type: 'backup', risk: 'critical', label: 'wp-config.php.tmp' },
    { path: '/wp-config.php.swp2', type: 'backup', risk: 'critical', label: 'wp-config.php.swp2' },
    { path: '/.wp-config.swp', type: 'backup', risk: 'critical', label: '.wp-config.swp' },
    { path: '/wp-config.php.save2', type: 'backup', risk: 'critical', label: 'wp-config.php.save2' },
    { path: '/wp-config.php.orig.bak', type: 'backup', risk: 'critical', label: 'wp-config.php.orig.bak' },
    { path: '/wp-config.php.old.bak', type: 'backup', risk: 'critical', label: 'wp-config.php.old.bak' },
    { path: '/wp-config.old.bak', type: 'backup', risk: 'critical', label: 'wp-config.old.bak' },
    { path: '/wp-config.bak2', type: 'backup', risk: 'critical', label: 'wp-config.bak2' },
    { path: '/wp-config.php.7z', type: 'backup', risk: 'critical', label: 'wp-config.php.7z' },
    { path: '/wp-config.php.rar', type: 'backup', risk: 'critical', label: 'wp-config.php.rar' },
    { path: '/wp-config.rar', type: 'backup', risk: 'critical', label: 'wp-config.rar' },
    { path: '/wp-config.7z', type: 'backup', risk: 'critical', label: 'wp-config.7z' },
    { path: '/database.sql.zip', type: 'backup', risk: 'critical', label: 'database.sql.zip' },
    { path: '/db.sql.gz', type: 'backup', risk: 'critical', label: 'db.sql.gz' },
    { path: '/db.sql.zip', type: 'backup', risk: 'critical', label: 'db.sql.zip' },
    { path: '/mysql.sql', type: 'backup', risk: 'critical', label: 'mysql.sql (root)' },
    { path: '/mysql.sql.gz', type: 'backup', risk: 'critical', label: 'mysql.sql.gz' },
    { path: '/data.sql', type: 'backup', risk: 'critical', label: 'data.sql' },
    { path: '/data.sql.gz', type: 'backup', risk: 'critical', label: 'data.sql.gz' },
    { path: '/production.sql', type: 'backup', risk: 'critical', label: 'production.sql' },
    { path: '/staging.sql', type: 'backup', risk: 'critical', label: 'staging.sql' },
    { path: '/dev.sql', type: 'backup', risk: 'critical', label: 'dev.sql' },
    { path: '/live.sql', type: 'backup', risk: 'critical', label: 'live.sql' },
    { path: '/all-in-one-wp-migration.tar.gz', type: 'backup', risk: 'critical', label: 'AIOWPM archive (root)' },
    { path: '/wp-content/ai1wm-backups/*.wpress', type: 'backup', risk: 'critical', label: 'AIOWPM .wpress' },
    { path: '/wp-content/mu-plugins/0-worker.php', type: 'plugin-file', risk: 'medium', label: 'MU Worker plugin' },
    { path: '/wp-content/mu-plugins/endurance-page-cache.php', type: 'plugin-file', risk: 'low', label: 'Endurance cache' },
    { path: '/wp-content/mu-plugins/endurance-php-edge.php', type: 'plugin-file', risk: 'low', label: 'Endurance PHP Edge' },
    { path: '/wp-content/mu-plugins/endurance-browser-cache.php', type: 'plugin-file', risk: 'low', label: 'Endurance browser cache' },
    { path: '/wp-content/mu-plugins/force-strong-passwords.php', type: 'plugin-file', risk: 'low', label: 'Force strong passwords' },
    { path: '/wp-content/mu-plugins/slt-force-strong-passwords.php', type: 'plugin-file', risk: 'low', label: 'SLT force strong pw' },
    { path: '/wp-content/mu-plugins/wpengine-common/', type: 'mu-plugins', risk: 'low', label: 'WP Engine common' },
    { path: '/wp-content/mu-plugins/kinsta-mu-plugins.php', type: 'plugin-file', risk: 'low', label: 'Kinsta MU plugin' },
    { path: '/wp-content/mu-plugins/pagely/', type: 'mu-plugins', risk: 'low', label: 'Pagely MU' },
    { path: '/wp-json/wp/v2/comments?per_page=100', type: 'rest-api', risk: 'low', label: 'REST comments 100' },
    { path: '/wp-json/wp/v2/posts?per_page=100', type: 'rest-api', risk: 'info', label: 'REST posts 100' },
    { path: '/wp-json/wp/v2/pages?per_page=100', type: 'rest-api', risk: 'info', label: 'REST pages 100' },
    { path: '/wp-json/wp/v2/media?per_page=100', type: 'rest-api', risk: 'low', label: 'REST media 100' },
    { path: '/wp-json/wp/v2/categories?per_page=100', type: 'rest-api', risk: 'info', label: 'REST categories 100' },
    { path: '/wp-json/wp/v2/tags?per_page=100', type: 'rest-api', risk: 'info', label: 'REST tags 100' },
    { path: '/wp-json/wp/v2/users?context=edit', type: 'rest-api', risk: 'medium', label: 'REST users context=edit' },
    { path: '/wp-json/wp/v2/settings?context=edit', type: 'rest-api', risk: 'high', label: 'REST settings edit' },
    { path: '/wp-json/wp/v2/plugins?context=edit', type: 'rest-api', risk: 'high', label: 'REST plugins edit' },
    { path: '/wp-json/wp/v2/themes?context=edit', type: 'rest-api', risk: 'high', label: 'REST themes edit' },
    { path: '/wp-json/wp/v2/menus?per_page=100', type: 'rest-api', risk: 'low', label: 'REST menus 100' },
    { path: '/wp-json/wp/v2/widgets?context=edit', type: 'rest-api', risk: 'medium', label: 'REST widgets edit' },
    { path: '/wp-json/wp/v2/templates?context=edit', type: 'rest-api', risk: 'medium', label: 'REST templates edit' },
    { path: '/wp-json/wp/v2/global-styles/themes', type: 'rest-api', risk: 'low', label: 'REST global styles themes' },
    { path: '/wp-json/wp/v2/block-patterns/patterns', type: 'rest-api', risk: 'low', label: 'REST block patterns' },
    { path: '/wp-json/wp/v2/block-patterns/categories', type: 'rest-api', risk: 'low', label: 'REST block pattern categories' },
    { path: '/wp-json/wp/v2/navigation', type: 'rest-api', risk: 'low', label: 'REST navigation' },
    { path: '/wp-json/wp/v2/font-collections', type: 'rest-api', risk: 'low', label: 'REST font collections' },
    { path: '/wp-json/wp-site-health/v1/tests/background-updates', type: 'rest-api', risk: 'low', label: 'Site health updates' },
    { path: '/wp-json/wp-site-health/v1/tests/loopback-requests', type: 'rest-api', risk: 'low', label: 'Site health loopback' },
    { path: '/wp-json/wp-site-health/v1/tests/https-status', type: 'rest-api', risk: 'low', label: 'Site health HTTPS' },
    { path: '/wp-json/wp-site-health/v1/tests/dotorg-communication', type: 'rest-api', risk: 'low', label: 'Site health dotorg' },
    { path: '/wp-json/wp-site-health/v1/tests/authorization-header', type: 'rest-api', risk: 'low', label: 'Site health auth header' },
    { path: '/wp-json/wp-site-health/v1/directory-sizes', type: 'rest-api', risk: 'low', label: 'Site health dir sizes' },
    { path: '/wp-json/wp/v2/application-passwords', type: 'rest-api', risk: 'medium', label: 'REST app passwords' },
    { path: '/wp-json/oembed/1.0/proxy', type: 'rest-api', risk: 'medium', label: 'oEmbed proxy' },
    { path: '/wp-json/oembed/1.0/embed?url=/', type: 'rest-api', risk: 'low', label: 'oEmbed root' },
    { path: '/?rest_route=/wp/v2/settings', type: 'rest-api', risk: 'medium', label: 'REST settings (rest_route)' },
    { path: '/?rest_route=/wp/v2/categories', type: 'rest-api', risk: 'info', label: 'REST categories (rest_route)' },
    { path: '/?rest_route=/wp/v2/tags', type: 'rest-api', risk: 'info', label: 'REST tags (rest_route)' },
    { path: '/?rest_route=/wp/v2/comments', type: 'rest-api', risk: 'low', label: 'REST comments (rest_route)' },
    { path: '/?rest_route=/wp/v2/media', type: 'rest-api', risk: 'info', label: 'REST media (rest_route)' },
    { path: '/?rest_route=/wp/v2/types', type: 'rest-api', risk: 'info', label: 'REST types (rest_route)' },
    { path: '/?rest_route=/wp/v2/taxonomies', type: 'rest-api', risk: 'info', label: 'REST taxonomies (rest_route)' },
    { path: '/?rest_route=/oembed/1.0/embed', type: 'rest-api', risk: 'low', label: 'oEmbed (rest_route)' }
  ];

  const WP_PATHS = Object.freeze((() => {
    const seen = new Set();
    const out = [];
    for (const item of [...BASE_WP_PATHS, ...EXTRA_PATHS]) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      out.push(item);
    }
    return out;
  })());

  const state = {
    api: null,
    settings: { ...DEFAULTS },
    runtime: {
      activeProfile: 'high',
      baseline: null,
      requestErrors: 0,
      requestErrorSamples: [],
      targetContext: null,
      dynamicPaths: [],
      falsePositivesFiltered: 0
    }
  };

  const ensureApi = () => {
    if (!state.api) throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    return state.api;
  };

  const L = (t, c = 'output') => ensureApi().line(String(t ?? ''), c);
  const SP = () => ensureApi().spacer();

  const applyProfile = name => {
    const p = PROFILES[name] || PROFILES.high;
    state.runtime.activeProfile = name;
    state.settings.maxConcurrentRequests = p.concurrent;
    return p;
  };

  const hashText = s => {
    const str = String(s || '');
    let h1 = 5381, h2 = 52711;
    const lim = Math.min(str.length, 16384);
    for (let i = 0; i < lim; i++) {
      const c = str.charCodeAt(i);
      h1 = ((h1 << 5) + h1) ^ c;
      h2 = ((h2 << 5) + h2) ^ c;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  };

  async function sha256(text) {
    const str = String(text || '');
    if (!str) return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    try {
      if (typeof crypto !== 'undefined' && crypto?.subtle && typeof TextEncoder !== 'undefined') {
        const lim = Math.min(str.length, 262144);
        const buf = new TextEncoder().encode(str.slice(0, lim));
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {}
    return hashText(str);
  }

  const normalizeTarget = rawUrl => {
    let v = String(rawUrl || '').trim();
    if (!v) throw new Error('URL is required');
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    const u = new URL(v);
    u.hash = '';
    return { origin: u.origin, url: u.href, domain: u.hostname };
  };

  const resolveUrl = (path, base) => {
    try { return new URL(path, base).href; } catch { return null; }
  };

  const getNetworkApi = () => {
    try { return globalThis.__FreeUserProxy?.api?.proxy || null; } catch { return null; }
  };

  async function fetchWithProxy(url, opts = {}) {
    const network = getNetworkApi();
    if (!network?.fetch) { const e = new Error('FreeUserProxy network API is not available.'); e.code = 'FREEUSERPROXY_UNAVAILABLE'; throw e; }
    return network.fetch(url, opts || {});
  }

  function recordRequestError(error) {
    state.runtime.requestErrors++;
    if (state.runtime.requestErrorSamples.length < 8) {
      const code = error?.code ? String(error.code) : 'NETWORK_ERROR';
      const message = error?.message ? String(error.message) : String(error || 'Request failed');
      state.runtime.requestErrorSamples.push(`${code}: ${message}`);
    }
  }

  async function fetchText(url, opts = {}) {
    try {
      const res = await fetchWithProxy(url, opts);
      return { status: res.status, text: await res.text(), headers: res.headers, res };
    } catch (error) {
      recordRequestError(error);
      throw error;
    }
  }

  async function probe404Fingerprints(origin) {
    const stamp = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const probes = [
      `/__wpcrack_404_${stamp}`,
      `/__definitely_not_found_${stamp}.html`,
      `/${stamp}.php`,
      `/__wpcrack_probe_${stamp}/deep/nested/path/`
    ];
    const results = [];
    const tasks = probes.map(p => async () => {
      try {
        const r = await fetchText(origin + p, { timeout: state.settings.probeTimeout, redirect: 'manual' });
        const text = r.text || '';
        const hash = await sha256(text);
        return {
          path: p,
          status: r.status,
          hash,
          len: text.length,
          contentType: r.headers.get('content-type') || '',
          title: (text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim().slice(0, 100)
        };
      } catch { return null; }
    });
    const list = await limitConcurrency(tasks, 4);
    for (const r of list) if (r) results.push(r);
    return results;
  }

  async function buildBaseline(origin) {
    const baseline = {
      hashes: [],
      nfHash: null, nfLen: null,
      rootHash: null, rootLen: null,
      explicit404: [],
      capturedAt: Date.now()
    };

    try {
      const r = await fetchText(origin + '/', { timeout: state.settings.probeTimeout, redirect: 'manual' });
      const text = r.text || '';
      const hash = await sha256(text);
      baseline.rootHash = hash;
      baseline.rootLen = text.length;
      baseline.hashes.push({ hash, len: text.length, source: 'root', status: r.status });
    } catch {}

    const f404 = await probe404Fingerprints(origin);
    baseline.explicit404 = f404;
    for (const f of f404) {
      if (f.hash) {
        baseline.hashes.push({ hash: f.hash, len: f.len, source: '404-probe', status: f.status, path: f.path });
        if (!baseline.nfHash) { baseline.nfHash = f.hash; baseline.nfLen = f.len; }
      }
    }

    return baseline;
  }

  async function isMirror(text, baseline, status) {
    if (!baseline || !text) return false;
    const len = text.length;
    const h = await sha256(text);
    for (const b of (baseline.hashes || [])) {
      if (!b || !b.hash) continue;
      if (b.hash === h) return true;
      if ((status === 404 || status === 410) && b.len > 0 && Math.abs(b.len - len) <= 24) return true;
    }
    return false;
  }

  async function detectWordPress(target) {
    const result = { isWP: false, signals: [], version: null, restApi: false, xmlrpc: false, wpLogin: false, theme: null, plugins: [] };

    try {
      const r = await fetchText(target.url, { timeout: state.settings.probeTimeout });
      const html = r.text.toLowerCase();
      if (/wp-content|wp-includes|wp-json/i.test(html)) { result.signals.push('wp-content/wp-includes in HTML'); result.isWP = true; }
      const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s+([\d.]+)/i);
      if (gen) { result.version = gen[1]; result.signals.push(`Generator meta: WordPress ${gen[1]}`); result.isWP = true; }
      if (r.headers.get('x-powered-by') && /wordpress/i.test(r.headers.get('x-powered-by'))) {
        result.signals.push('X-Powered-By: WordPress');
        result.isWP = true;
      }
      const linkHeader = r.headers.get('link') || '';
      if (/wp-json/i.test(linkHeader)) { result.signals.push('Link header: wp-json'); result.isWP = true; result.restApi = true; }
      const ctx = extractTargetContext(r.text, target.origin);
      if (ctx.theme) result.theme = ctx.theme;
      if (ctx.plugins?.length) result.plugins = ctx.plugins;
    } catch {}

    try {
      const r = await fetchText(resolveUrl('/wp-login.php', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /wp-submit|user_login|wordpress/i.test(r.text)) {
        result.signals.push('wp-login.php reachable');
        result.isWP = true;
        result.wpLogin = true;
      }
    } catch {}

    try {
      const r = await fetchText(resolveUrl('/wp-json/', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /wp\/v2|wordpress/i.test(r.text)) {
        result.signals.push('REST API /wp-json/ exposed');
        result.restApi = true;
        result.isWP = true;
      }
    } catch {}

    try {
      const r = await fetchText(resolveUrl('/xmlrpc.php', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /XML-RPC server accepts POST requests only/i.test(r.text)) {
        result.signals.push('xmlrpc.php reachable');
        result.xmlrpc = true;
        result.isWP = true;
      } else if (r.status === 405 || r.status === 200) {
        result.xmlrpc = true;
      }
    } catch {}

    try {
      const r = await fetchText(resolveUrl('/readme.html', target.origin), { timeout: state.settings.probeTimeout });
      if (r.status === 200 && /wordpress/i.test(r.text)) {
        const v = r.text.match(/Version\s+([\d.]+)/i);
        if (v && !result.version) result.version = v[1];
        result.signals.push('readme.html exposed');
        result.isWP = true;
      }
    } catch {}

    return result;
  }

  function extractTargetContext(html, origin) {
    const context = { theme: null, themes: [], plugins: [], siteName: null, wpVersion: null, domain: null };
    try { context.domain = new URL(origin).hostname; } catch {}
    if (!html) return context;
    const themeMatches = html.match(/wp-content\/themes\/([a-zA-Z0-9_\-]+)/g);
    if (themeMatches && themeMatches.length) {
      const names = new Set();
      for (const m of themeMatches) {
        const name = m.split('/').pop();
        if (name && name.length > 1 && name !== 'themes') names.add(name);
      }
      context.themes = Array.from(names);
      context.theme = context.themes[0] || null;
    }
    const pluginMatches = html.match(/wp-content\/plugins\/([a-zA-Z0-9_\-]+)/g);
    if (pluginMatches && pluginMatches.length) {
      const names = new Set();
      for (const m of pluginMatches) {
        const name = m.split('/').pop();
        if (name && name.length > 1 && name !== 'plugins') names.add(name);
      }
      context.plugins = Array.from(names);
    }
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) context.siteName = titleMatch[1].trim().slice(0, 120);
    const genMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s+([\d.]+)/i);
    if (genMatch) context.wpVersion = genMatch[1];
    if (!context.wpVersion) {
      const verMatch = html.match(/wp-includes[^"'?]*\?ver=([\d.]+)/i);
      if (verMatch) context.wpVersion = verMatch[1];
    }
    return context;
  }

  function buildDynamicPaths(context) {
    const paths = [];
    if (!context) return paths;
    if (Array.isArray(context.themes)) {
      for (const theme of context.themes.slice(0, 3)) {
        paths.push({ path: `/wp-content/themes/${theme}/`, type: 'theme-dir', risk: 'info', label: `Theme dir: ${theme}` });
        paths.push({ path: `/wp-content/themes/${theme}/style.css`, type: 'theme-file', risk: 'medium', label: `Theme style.css: ${theme}` });
        paths.push({ path: `/wp-content/themes/${theme}/readme.txt`, type: 'theme-file', risk: 'medium', label: `Theme readme: ${theme}` });
        paths.push({ path: `/wp-content/themes/${theme}/functions.php`, type: 'theme-file', risk: 'low', label: `Theme functions: ${theme}` });
        paths.push({ path: `/wp-content/themes/${theme}/screenshot.png`, type: 'theme-file', risk: 'low', label: `Theme screenshot: ${theme}` });
        paths.push({ path: `/wp-content/themes/${theme}/changelog.txt`, type: 'theme-file', risk: 'low', label: `Theme changelog: ${theme}` });
      }
    }
    if (Array.isArray(context.plugins)) {
      for (const plugin of context.plugins.slice(0, 15)) {
        paths.push({ path: `/wp-content/plugins/${plugin}/`, type: 'plugin-dir', risk: 'low', label: `Plugin dir: ${plugin}` });
        paths.push({ path: `/wp-content/plugins/${plugin}/readme.txt`, type: 'plugin-file', risk: 'medium', label: `Plugin readme: ${plugin}` });
        paths.push({ path: `/wp-content/plugins/${plugin}/changelog.txt`, type: 'plugin-file', risk: 'low', label: `Plugin changelog: ${plugin}` });
      }
    }
    return paths;
  }

  async function enumerateUsersREST(target) {
    const users = [];
    const endpoints = [
      '/wp-json/wp/v2/users?per_page=100',
      '/wp-json/wp/v2/users?per_page=100&orderby=id',
      '/?rest_route=/wp/v2/users&per_page=100'
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetchText(resolveUrl(ep, target.origin), { timeout: state.settings.probeTimeout });
        if (r.status !== 200) continue;
        const data = JSON.parse(r.text);
        if (!Array.isArray(data)) continue;
        for (const u of data) {
          if (u && typeof u === 'object') {
            users.push({ id: u.id, slug: u.slug, name: u.name, source: 'REST-API' });
          }
        }
        if (users.length) break;
      } catch {}
    }
    return users;
  }

  async function enumerateUsersAuthor(target) {
    const users = [];
    const found = new Set();
    const tasks = [];
    for (let i = 1; i <= 10; i++) {
      tasks.push(async () => {
        try {
          const r = await fetchWithProxy(resolveUrl(`/?author=${i}`, target.origin), {
            timeout: state.settings.probeTimeout,
            redirect: 'manual'
          });
          const loc = r.headers.get('location') || '';
          const m = loc.match(/\/author\/([^\/\?]+)/);
          if (m && m[1]) {
            const slug = decodeURIComponent(m[1]);
            if (!found.has(slug)) { found.add(slug); users.push({ id: i, slug, name: null, source: 'author-redirect' }); }
          }
        } catch {}
      });
    }
    await limitConcurrency(tasks, 8);
    return users;
  }

  async function enumerateUsersSitemap(target) {
    const users = [];
    const sources = [
      '/wp-sitemap.xml',
      '/wp-sitemap-users-1.xml',
      '/sitemap.xml',
      '/sitemap_index.xml'
    ];
    const seen = new Set();
    for (const path of sources) {
      try {
        const r = await fetchText(resolveUrl(path, target.origin), { timeout: state.settings.probeTimeout });
        if (r.status !== 200) continue;
        const text = r.text || '';
        const authorRe = /\/author\/([a-zA-Z0-9_\-\.]+)/g;
        let m;
        while ((m = authorRe.exec(text)) !== null) {
          const slug = m[1];
          if (slug && !seen.has(slug)) {
            seen.add(slug);
            users.push({ id: null, slug, name: null, source: 'sitemap' });
          }
        }
      } catch {}
    }
    return users;
  }

  async function enumerateUsersFeed(target) {
    const users = [];
    const seen = new Set();
    const feeds = ['/feed/', '/feed/atom/', '/comments/feed/'];
    for (const fp of feeds) {
      try {
        const r = await fetchText(resolveUrl(fp, target.origin), { timeout: state.settings.probeTimeout });
        if (r.status !== 200) continue;
        const text = r.text || '';
        const dcCreatorRe = /<dc:creator>([^<]+)<\/dc:creator>/gi;
        let m;
        while ((m = dcCreatorRe.exec(text)) !== null) {
          const name = m[1].trim();
          if (name && !seen.has(name)) {
            seen.add(name);
            users.push({ id: null, slug: name, name, source: 'feed-dc-creator' });
          }
        }
        const authorRe = /\/author\/([a-zA-Z0-9_\-\.]+)/g;
        while ((m = authorRe.exec(text)) !== null) {
          const slug = m[1];
          if (slug && !seen.has(slug)) {
            seen.add(slug);
            users.push({ id: null, slug, name: null, source: 'feed-author-link' });
          }
        }
      } catch {}
    }
    return users;
  }

  async function enumerateUsersOembed(target) {
    const users = [];
    try {
      const r = await fetchText(resolveUrl('/wp-json/oembed/1.0/embed?url=' + encodeURIComponent(target.origin + '/'), target.origin), {
        timeout: state.settings.probeTimeout
      });
      if (r.status !== 200) return users;
      try {
        const data = JSON.parse(r.text);
        if (data && data.author_name) {
          users.push({ id: null, slug: null, name: data.author_name, source: 'oembed' });
        }
        if (data && data.author_url) {
          const m = String(data.author_url).match(/\/author\/([^\/]+)/);
          if (m) users.push({ id: null, slug: m[1], name: data.author_name || null, source: 'oembed-author-url' });
        }
      } catch {}
    } catch {}
    return users;
  }

  async function scanPaths(target) {
    const results = [];
    const allPaths = WP_PATHS.concat(state.runtime.dynamicPaths || []);
    state.runtime.falsePositivesFiltered = 0;

    const tasks = allPaths.map(item => async () => {
      try {
        const url = resolveUrl(item.path, target.origin);
        if (!url) return null;
        const r = await fetchText(url, { timeout: state.settings.probeTimeout, redirect: 'manual' });
        const text = r.text || '';
        const status = r.status;

        if (await isMirror(text, state.runtime.baseline, status)) {
          state.runtime.falsePositivesFiltered++;
          return null;
        }

        let found = false;
        if (status === 200) {
          if (item.type === 'backup' && text.length > 50 && /DB_|define\(|password|mysql|DB_NAME|DB_USER|DB_PASSWORD/i.test(text)) {
            found = true;
          } else if (item.type === 'log' && text.length > 100) {
            found = true;
          } else if (item.type === 'user-enum-api' && /\[.*"id"/.test(text)) {
            found = true;
          } else if (item.type === 'rest-api' && /"namespace"|"routes"|"wp\/v2"/.test(text)) {
            found = true;
          } else if (item.type === 'sitemap' && /<urlset|<sitemapindex|<loc>/i.test(text)) {
            found = true;
          } else if (item.type === 'feed' && /<rss|<feed|<channel|<item>/i.test(text)) {
            found = true;
          } else if (item.type === 'version-disclosure' && /version/i.test(text)) {
            found = true;
          } else if (item.type === 'plugin-file' || item.type === 'theme-file') {
            if (text.length > 20 && !/^\s*</.test(text)) found = true;
          } else if (item.type === 'config' && text.length > 20 && /<IfModule|RewriteRule|define\(|<\?php/i.test(text)) {
            found = true;
          } else if (item.type === 'info-leak' && /phpinfo|php version|PHP Version|SERVER\[/i.test(text)) {
            found = true;
          } else if (!['backup', 'log', 'plugin-file', 'theme-file', 'config', 'info-leak'].includes(item.type) && text.length > 50) {
            found = true;
          }
        } else if (status === 401 || status === 403) {
          if (['admin', 'login', 'setup', 'install'].includes(item.type)) found = true;
        } else if (status === 301 || status === 302) {
          const loc = r.headers.get('location') || '';
          if (item.type === 'user-enum-author' && /\/author\//.test(loc)) found = true;
          if (item.type === 'admin' && /wp-login\.php/.test(loc)) found = true;
        }

        if (found) {
          return {
            ...item,
            url,
            status,
            size: text.length,
            preview: (item.type === 'backup' || item.type === 'config') && text.length > 30
              ? text.slice(0, 80).replace(/\s+/g, ' ')
              : null
          };
        }
      } catch {}
      return null;
    });
    const list = await limitConcurrency(tasks, PROFILES[state.runtime.activeProfile].concurrent);
    for (const r of list) if (r) results.push(r);
    return results;
  }

  function limitConcurrency(tasks, limit) {
    return new Promise(resolve => {
      const results = new Array(tasks.length);
      let idx = 0, active = 0, done = 0;
      const total = tasks.length;
      if (total === 0) { resolve(results); return; }
      const run = () => {
        while (active < limit && idx < total) {
          const i = idx++;
          active++;
          Promise.resolve()
            .then(() => tasks[i]())
            .then(r => { results[i] = r; })
            .catch(e => { results[i] = { error: e.message }; })
            .finally(() => { active--; done++; if (done === total) resolve(results); else run(); });
        }
      };
      run();
    });
  }

  function renderScanReport(target, detect, paths, users, options) {
    const out = [];
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(L('  WPCRACK · WORDPRESS SECURITY REPORT', 'accent'));
    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(SP());
    out.push(L(`├── 🎯 Target: ${target.origin}`, 'accent'));
    out.push(L(`│   ├── WordPress detected: ${detect.isWP ? 'YES' : 'NO'}`, detect.isWP ? 'success' : 'danger'));
    out.push(L(`│   ├── Version: ${detect.version || 'unknown'}`, detect.version ? 'success' : 'muted'));
    out.push(L(`│   ├── REST API: ${detect.restApi ? 'exposed' : 'no'}`, detect.restApi ? 'warning' : 'success'));
    out.push(L(`│   ├── XML-RPC: ${detect.xmlrpc ? 'enabled' : 'no'}`, detect.xmlrpc ? 'warning' : 'success'));
    out.push(L(`│   ├── Theme: ${detect.theme || 'unknown'}`, detect.theme ? 'warning' : 'muted'));
    out.push(L(`│   └── Plugins detected: ${detect.plugins?.length || 0}`, (detect.plugins?.length || 0) > 0 ? 'warning' : 'muted'));
    if (detect.plugins && detect.plugins.length) {
      for (const p of detect.plugins) out.push(L(`│      • ${p}`, 'dim'));
    }
    if (detect.signals.length) {
      out.push(L('│   Signals:', 'muted'));
      for (const s of detect.signals) out.push(L(`│      • ${s}`, 'dim'));
    }

    out.push(SP());
    out.push(L('├── 🛡️  VULNERABILITY SCAN', 'accent'));
    out.push(L(`│   ├── Static paths checked: ${WP_PATHS.length}`, 'muted'));
    out.push(L(`│   ├── Dynamic paths checked: ${(state.runtime.dynamicPaths || []).length}`, 'muted'));
    out.push(L(`│   ├── 404 fingerprints (SHA-256): ${(state.runtime.baseline?.explicit404?.length || 0)}`, 'muted'));
    out.push(L(`│   ├── False positives filtered: ${state.runtime.falsePositivesFiltered || 0}`, (state.runtime.falsePositivesFiltered || 0) > 0 ? 'success' : 'muted'));
    if (paths.length === 0) {
      out.push(L('│   └── No exposed paths detected.', 'success'));
    } else {
      const critical = paths.filter(p => p.risk === 'critical');
      const high = paths.filter(p => p.risk === 'high');
      const medium = paths.filter(p => p.risk === 'medium');
      const low = paths.filter(p => p.risk === 'low');
      const info = paths.filter(p => p.risk === 'info');

      const render = (list, label, cls) => {
        if (!list.length) return;
        out.push(L(`│   ├── ${label} (${list.length}):`, cls));
        for (const p of list) {
          out.push(L(`│   │   • ${p.url} [${p.status}]`, cls));
          if (p.preview) out.push(L(`│   │     └─ ${p.preview}`, 'dim'));
        }
      };
      render(critical, '🔴 CRITICAL', 'danger');
      render(high, '🟠 HIGH', 'warning');
      render(medium, '🟡 MEDIUM', 'accent');
      render(low, '🟢 LOW', 'output');
      render(info, 'ℹ️  INFO', 'muted');
    }

    out.push(SP());
    out.push(L('├── 👥 USER ENUMERATION', 'accent'));
    if (users.length === 0) {
      out.push(L('│   └── No users discovered.', 'success'));
    } else {
      const bySource = {};
      for (const u of users) {
        const src = u.source || 'unknown';
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(u);
      }
      for (const [src, list] of Object.entries(bySource)) {
        out.push(L(`│   ├── via ${src} (${list.length}):`, 'warning'));
        for (const u of list) {
          const display = u.slug || u.name || `id:${u.id}`;
          out.push(L(`│   │   • ${display}${u.id ? ` (ID: ${u.id})` : ''}`, 'danger'));
        }
      }
    }

    out.push(SP());
    out.push(L('├── 📊 SUMMARY', 'accent'));
    const criticalCount = paths.filter(p => p.risk === 'critical').length;
    const highCount = paths.filter(p => p.risk === 'high').length;
    const requestErrors = Math.max(0, Number(options?.errors) || 0);
    const verdict = criticalCount > 0 ? 'CRITICAL' : highCount > 0 ? 'HIGH' : paths.length > 0 ? 'MEDIUM' : requestErrors > 0 ? 'INCOMPLETE' : 'CLEAN';
    const verdictCls = criticalCount > 0 ? 'danger' : highCount > 0 ? 'warning' : paths.length > 0 ? 'accent' : requestErrors > 0 ? 'warning' : 'success';
    out.push(L(`│   ├── Verdict: ${verdict}`, verdictCls));
    out.push(L(`│   ├── Critical paths: ${criticalCount}`, criticalCount > 0 ? 'danger' : 'muted'));
    out.push(L(`│   ├── High-risk paths: ${highCount}`, highCount > 0 ? 'warning' : 'muted'));
    out.push(L(`│   ├── Total paths found: ${paths.length}`, 'muted'));
    out.push(L(`│   ├── Total users found: ${users.length}`, users.length > 0 ? 'warning' : 'muted'));
    out.push(L(`│   └── Network errors: ${requestErrors}`, requestErrors > 0 ? 'warning' : 'muted'));
    if (requestErrors > 0) {
      out.push(L('│      Scan results are incomplete; network failures were not treated as CLEAN.', 'warning'));
      const samples = Array.isArray(options?.samples) ? options.samples : [];
      for (const sample of samples) out.push(L(`│      • ${sample}`, 'dim'));
    }

    out.push(L('═══════════════════════════════════════════════', 'accent'));
    out.push(L('⚠️  AUTHORIZED TESTING ONLY', 'danger'));
    return out;
  }

  async function cmdScan(target, profileName, api) {
    applyProfile(profileName);
    state.runtime.requestErrors = 0;
    state.runtime.requestErrorSamples = [];
    state.runtime.dynamicPaths = [];
    state.runtime.falsePositivesFiltered = 0;
    const target_ = normalizeTarget(target);

    api.append([L(`◈ WPCrack scan v${VERSION} — ${PROFILES[profileName].label}`, 'accent')]);
    api.append([L(`◈ Building baseline + 404 SHA-256 fingerprints...`, 'muted')]);
    state.runtime.baseline = await buildBaseline(target_.origin);

    const f404Count = state.runtime.baseline?.explicit404?.length || 0;
    api.append([L(`◈ 404 fingerprints captured: ${f404Count} (SHA-256)`, 'success')]);

    api.append([L(`◈ Detecting WordPress...`, 'muted')]);
    const detect = await detectWordPress(target_);

    if (!detect.isWP) {
      api.append([
        L('⚠️  WordPress not detected with high confidence.', 'warning'),
        L('    Continuing scan anyway...', 'muted')
      ]);
    }

    try {
      const r = await fetchText(target_.url, { timeout: state.settings.probeTimeout });
      state.runtime.targetContext = extractTargetContext(r.text, target_.origin);
      state.runtime.dynamicPaths = buildDynamicPaths(state.runtime.targetContext);
      if (state.runtime.dynamicPaths.length) {
        api.append([L(`◈ Dynamic paths discovered from HTML: ${state.runtime.dynamicPaths.length}`, 'muted')]);
      }
    } catch {}

    api.append([L(`◈ Scanning ${WP_PATHS.length + state.runtime.dynamicPaths.length} sensitive paths...`, 'muted')]);
    const paths = await scanPaths(target_);

    if (state.runtime.falsePositivesFiltered > 0) {
      api.append([L(`◈ False positives filtered (404-hash match): ${state.runtime.falsePositivesFiltered}`, 'success')]);
    }

    api.append([L(`◈ Enumerating users (REST + Author + Sitemap + Feed + oEmbed)...`, 'muted')]);
    const [usersREST, usersAuthor, usersSitemap, usersFeed, usersOembed] = await Promise.all([
      enumerateUsersREST(target_),
      enumerateUsersAuthor(target_),
      enumerateUsersSitemap(target_),
      enumerateUsersFeed(target_),
      enumerateUsersOembed(target_)
    ]);
    const seen = new Set();
    const users = [];
    for (const u of [...usersREST, ...usersAuthor, ...usersSitemap, ...usersFeed, ...usersOembed]) {
      const key = (u.slug || u.name || u.id || '').toString().toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); users.push(u); }
    }

    const requestDiagnostics = {
      errors: state.runtime.requestErrors,
      samples: state.runtime.requestErrorSamples.slice(),
      testedPaths: WP_PATHS.length + state.runtime.dynamicPaths.length
    };
    const report = renderScanReport(target_, detect, paths, users, requestDiagnostics);
    api.append(report);
    return [];
  }

  async function cmdUsers(target, api) {
    applyProfile('high');
    const target_ = normalizeTarget(target);
    state.runtime.baseline = await buildBaseline(target_.origin);

    const out = [];
    out.push(L('── USER ENUMERATION ──', 'accent'));
    out.push(L(`Target: ${target_.origin}`));
    out.push(SP());

    out.push(L('Method 1: REST API', 'accent'));
    const r1 = await enumerateUsersREST(target_);
    if (r1.length === 0) out.push(L('  └── No users via REST API', 'muted'));
    else r1.forEach(u => out.push(L(`  ✓ ${u.slug || u.name} (ID: ${u.id})${u.name ? ' — ' + u.name : ''}`, 'success')));

    out.push(SP());
    out.push(L('Method 2: Author redirect (?author=1..10)', 'accent'));
    const r2 = await enumerateUsersAuthor(target_);
    if (r2.length === 0) out.push(L('  └── No users via author redirect', 'muted'));
    else r2.forEach(u => out.push(L(`  ✓ ${u.slug} (ID: ${u.id})`, 'success')));

    out.push(SP());
    out.push(L('Method 3: Sitemap', 'accent'));
    const r3 = await enumerateUsersSitemap(target_);
    if (r3.length === 0) out.push(L('  └── No users via sitemap', 'muted'));
    else r3.forEach(u => out.push(L(`  ✓ ${u.slug}`, 'success')));

    out.push(SP());
    out.push(L('Method 4: Feed', 'accent'));
    const r4 = await enumerateUsersFeed(target_);
    if (r4.length === 0) out.push(L('  └── No users via feed', 'muted'));
    else r4.forEach(u => out.push(L(`  ✓ ${u.slug || u.name}`, 'success')));

    out.push(SP());
    out.push(L('Method 5: oEmbed', 'accent'));
    const r5 = await enumerateUsersOembed(target_);
    if (r5.length === 0) out.push(L('  └── No users via oembed', 'muted'));
    else r5.forEach(u => out.push(L(`  ✓ ${u.slug || u.name}`, 'success')));

    api.append(out);
    return [];
  }

  const dispatch = async ({ args = [], api } = {}) => {
    const cmd = String(args[0] ?? '').toLowerCase();
    const rest = args.slice(1);
    const positional = rest.filter(a => !a.startsWith('--'));

    if (!cmd || cmd === 'help') {
      return [
        L('╭──────────────────────────────────────────╮', 'accent'),
        L(`│  WPCRACK v${VERSION} · COMMANDS          │`, 'accent'),
        L('╰──────────────────────────────────────────╯', 'accent'),
        SP(),
        L('⚠️  For AUTHORIZED penetration testing only.', 'danger'),
        SP(),
        L('SCAN', 'accent'),
        L('  wpcrack scan <url>              Full security scan (high-power)', 'muted'),
        L('  wpcrack lowscan <url>           Full security scan (mobile/low-power)', 'muted'),
        L('  wpcrack users <url>             User enumeration (5 methods)', 'muted'),
        SP(),
        L('NOTES', 'accent'),
        L('  • 404 fingerprints hashed with SHA-256 to filter soft-404 false positives', 'muted'),
        L('  • Output is complete; nothing is truncated', 'muted'),
        SP(),
        L('⚠️  AUTHORIZED TESTING ONLY — this tool generates attack traffic.', 'danger')
      ];
    }

    if (cmd === 'version') return [L(`wpcrack v${VERSION}`, 'accent')];

    const target = positional[0];
    if (!target) {
      return [L(`usage: wpcrack ${cmd} <url>`, 'danger')];
    }

    try {
      if (cmd === 'scan') return await cmdScan(target, 'high', api);
      if (cmd === 'lowscan') return await cmdScan(target, 'low', api);
      if (cmd === 'users') return await cmdUsers(target, api);
      return [L(`unknown command: ${cmd}. Try "wpcrack help".`, 'danger')];
    } catch (e) {
      return [L(`❌ error: ${e.message}`, 'danger')];
    }
  };

  const install = async api => {
    if (!api || typeof api !== 'object') throw new Error('PACKAGE_BRIDGE_UNAVAILABLE');
    const required = ['registerCommand', 'unregisterCommand', 'line', 'spacer'];
    for (const m of required) {
      if (typeof api[m] !== 'function') throw new Error(`PACKAGE_BRIDGE_${m.toUpperCase()}_UNAVAILABLE`);
    }
    state.api = api;
    const registered = api.registerCommand('wpcrack', {
      description: MANIFEST.description,
      usage: 'wpcrack <scan|lowscan|users|help|version> [url]',
      aliases: [],
      kind: 'plain',
      run: async ({ args = [], api: scopedApi } = {}) => {
        state.api = scopedApi || state.api;
        return await dispatch({ args, api: state.api });
      }
    });
    if (registered === false) {
      state.api = null;
      throw new Error('PACKAGE_COMMAND_REGISTRATION_FAILED');
    }
    return [];
  };

  const uninstall = async api => {
    const bridge = api || state.api;
    try { if (bridge?.unregisterCommand) bridge.unregisterCommand('wpcrack'); } catch {}
    state.api = null;
    return [];
  };

  globalThis[GLOBAL_KEY] = Object.freeze({
    manifest: MANIFEST,
    install,
    uninstall
  });
})();