// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = import.meta.require;

// node_modules/neo-blessed/lib/alias.js
var require_alias = __commonJS((exports) => {
  var alias = exports;
  alias.bools = {
    auto_left_margin: ["bw", "bw"],
    auto_right_margin: ["am", "am"],
    back_color_erase: ["bce", "ut"],
    can_change: ["ccc", "cc"],
    ceol_standout_glitch: ["xhp", "xs"],
    col_addr_glitch: ["xhpa", "YA"],
    cpi_changes_res: ["cpix", "YF"],
    cr_cancels_micro_mode: ["crxm", "YB"],
    dest_tabs_magic_smso: ["xt", "xt"],
    eat_newline_glitch: ["xenl", "xn"],
    erase_overstrike: ["eo", "eo"],
    generic_type: ["gn", "gn"],
    hard_copy: ["hc", "hc"],
    hard_cursor: ["chts", "HC"],
    has_meta_key: ["km", "km"],
    has_print_wheel: ["daisy", "YC"],
    has_status_line: ["hs", "hs"],
    hue_lightness_saturation: ["hls", "hl"],
    insert_null_glitch: ["in", "in"],
    lpi_changes_res: ["lpix", "YG"],
    memory_above: ["da", "da"],
    memory_below: ["db", "db"],
    move_insert_mode: ["mir", "mi"],
    move_standout_mode: ["msgr", "ms"],
    needs_xon_xoff: ["nxon", "nx"],
    no_esc_ctlc: ["xsb", "xb"],
    no_pad_char: ["npc", "NP"],
    non_dest_scroll_region: ["ndscr", "ND"],
    non_rev_rmcup: ["nrrmc", "NR"],
    over_strike: ["os", "os"],
    prtr_silent: ["mc5i", "5i"],
    row_addr_glitch: ["xvpa", "YD"],
    semi_auto_right_margin: ["sam", "YE"],
    status_line_esc_ok: ["eslok", "es"],
    tilde_glitch: ["hz", "hz"],
    transparent_underline: ["ul", "ul"],
    xon_xoff: ["xon", "xo"]
  };
  alias.numbers = {
    columns: ["cols", "co"],
    init_tabs: ["it", "it"],
    label_height: ["lh", "lh"],
    label_width: ["lw", "lw"],
    lines: ["lines", "li"],
    lines_of_memory: ["lm", "lm"],
    magic_cookie_glitch: ["xmc", "sg"],
    max_attributes: ["ma", "ma"],
    max_colors: ["colors", "Co"],
    max_pairs: ["pairs", "pa"],
    maximum_windows: ["wnum", "MW"],
    no_color_video: ["ncv", "NC"],
    num_labels: ["nlab", "Nl"],
    padding_baud_rate: ["pb", "pb"],
    virtual_terminal: ["vt", "vt"],
    width_status_line: ["wsl", "ws"],
    bit_image_entwining: ["bitwin", "Yo"],
    bit_image_type: ["bitype", "Yp"],
    buffer_capacity: ["bufsz", "Ya"],
    buttons: ["btns", "BT"],
    dot_horz_spacing: ["spinh", "Yc"],
    dot_vert_spacing: ["spinv", "Yb"],
    max_micro_address: ["maddr", "Yd"],
    max_micro_jump: ["mjump", "Ye"],
    micro_col_size: ["mcs", "Yf"],
    micro_line_size: ["mls", "Yg"],
    number_of_pins: ["npins", "Yh"],
    output_res_char: ["orc", "Yi"],
    output_res_horz_inch: ["orhi", "Yk"],
    output_res_line: ["orl", "Yj"],
    output_res_vert_inch: ["orvi", "Yl"],
    print_rate: ["cps", "Ym"],
    wide_char_size: ["widcs", "Yn"]
  };
  alias.strings = {
    acs_chars: ["acsc", "ac"],
    back_tab: ["cbt", "bt"],
    bell: ["bel", "bl"],
    carriage_return: ["cr", "cr"],
    change_char_pitch: ["cpi", "ZA"],
    change_line_pitch: ["lpi", "ZB"],
    change_res_horz: ["chr", "ZC"],
    change_res_vert: ["cvr", "ZD"],
    change_scroll_region: ["csr", "cs"],
    char_padding: ["rmp", "rP"],
    clear_all_tabs: ["tbc", "ct"],
    clear_margins: ["mgc", "MC"],
    clear_screen: ["clear", "cl"],
    clr_bol: ["el1", "cb"],
    clr_eol: ["el", "ce"],
    clr_eos: ["ed", "cd"],
    column_address: ["hpa", "ch"],
    command_character: ["cmdch", "CC"],
    create_window: ["cwin", "CW"],
    cursor_address: ["cup", "cm"],
    cursor_down: ["cud1", "do"],
    cursor_home: ["home", "ho"],
    cursor_invisible: ["civis", "vi"],
    cursor_left: ["cub1", "le"],
    cursor_mem_address: ["mrcup", "CM"],
    cursor_normal: ["cnorm", "ve"],
    cursor_right: ["cuf1", "nd"],
    cursor_to_ll: ["ll", "ll"],
    cursor_up: ["cuu1", "up"],
    cursor_visible: ["cvvis", "vs"],
    define_char: ["defc", "ZE"],
    delete_character: ["dch1", "dc"],
    delete_line: ["dl1", "dl"],
    dial_phone: ["dial", "DI"],
    dis_status_line: ["dsl", "ds"],
    display_clock: ["dclk", "DK"],
    down_half_line: ["hd", "hd"],
    ena_acs: ["enacs", "eA"],
    enter_alt_charset_mode: ["smacs", "as"],
    enter_am_mode: ["smam", "SA"],
    enter_blink_mode: ["blink", "mb"],
    enter_bold_mode: ["bold", "md"],
    enter_ca_mode: ["smcup", "ti"],
    enter_delete_mode: ["smdc", "dm"],
    enter_dim_mode: ["dim", "mh"],
    enter_doublewide_mode: ["swidm", "ZF"],
    enter_draft_quality: ["sdrfq", "ZG"],
    enter_insert_mode: ["smir", "im"],
    enter_italics_mode: ["sitm", "ZH"],
    enter_leftward_mode: ["slm", "ZI"],
    enter_micro_mode: ["smicm", "ZJ"],
    enter_near_letter_quality: ["snlq", "ZK"],
    enter_normal_quality: ["snrmq", "ZL"],
    enter_protected_mode: ["prot", "mp"],
    enter_reverse_mode: ["rev", "mr"],
    enter_secure_mode: ["invis", "mk"],
    enter_shadow_mode: ["sshm", "ZM"],
    enter_standout_mode: ["smso", "so"],
    enter_subscript_mode: ["ssubm", "ZN"],
    enter_superscript_mode: ["ssupm", "ZO"],
    enter_underline_mode: ["smul", "us"],
    enter_upward_mode: ["sum", "ZP"],
    enter_xon_mode: ["smxon", "SX"],
    erase_chars: ["ech", "ec"],
    exit_alt_charset_mode: ["rmacs", "ae"],
    exit_am_mode: ["rmam", "RA"],
    exit_attribute_mode: ["sgr0", "me"],
    exit_ca_mode: ["rmcup", "te"],
    exit_delete_mode: ["rmdc", "ed"],
    exit_doublewide_mode: ["rwidm", "ZQ"],
    exit_insert_mode: ["rmir", "ei"],
    exit_italics_mode: ["ritm", "ZR"],
    exit_leftward_mode: ["rlm", "ZS"],
    exit_micro_mode: ["rmicm", "ZT"],
    exit_shadow_mode: ["rshm", "ZU"],
    exit_standout_mode: ["rmso", "se"],
    exit_subscript_mode: ["rsubm", "ZV"],
    exit_superscript_mode: ["rsupm", "ZW"],
    exit_underline_mode: ["rmul", "ue"],
    exit_upward_mode: ["rum", "ZX"],
    exit_xon_mode: ["rmxon", "RX"],
    fixed_pause: ["pause", "PA"],
    flash_hook: ["hook", "fh"],
    flash_screen: ["flash", "vb"],
    form_feed: ["ff", "ff"],
    from_status_line: ["fsl", "fs"],
    goto_window: ["wingo", "WG"],
    hangup: ["hup", "HU"],
    init_1string: ["is1", "i1"],
    init_2string: ["is2", "is"],
    init_3string: ["is3", "i3"],
    init_file: ["if", "if"],
    init_prog: ["iprog", "iP"],
    initialize_color: ["initc", "Ic"],
    initialize_pair: ["initp", "Ip"],
    insert_character: ["ich1", "ic"],
    insert_line: ["il1", "al"],
    insert_padding: ["ip", "ip"],
    key_a1: ["ka1", "K1"],
    key_a3: ["ka3", "K3"],
    key_b2: ["kb2", "K2"],
    key_backspace: ["kbs", "kb"],
    key_beg: ["kbeg", "@1"],
    key_btab: ["kcbt", "kB"],
    key_c1: ["kc1", "K4"],
    key_c3: ["kc3", "K5"],
    key_cancel: ["kcan", "@2"],
    key_catab: ["ktbc", "ka"],
    key_clear: ["kclr", "kC"],
    key_close: ["kclo", "@3"],
    key_command: ["kcmd", "@4"],
    key_copy: ["kcpy", "@5"],
    key_create: ["kcrt", "@6"],
    key_ctab: ["kctab", "kt"],
    key_dc: ["kdch1", "kD"],
    key_dl: ["kdl1", "kL"],
    key_down: ["kcud1", "kd"],
    key_eic: ["krmir", "kM"],
    key_end: ["kend", "@7"],
    key_enter: ["kent", "@8"],
    key_eol: ["kel", "kE"],
    key_eos: ["ked", "kS"],
    key_exit: ["kext", "@9"],
    key_f0: ["kf0", "k0"],
    key_f1: ["kf1", "k1"],
    key_f10: ["kf10", "k;"],
    key_f11: ["kf11", "F1"],
    key_f12: ["kf12", "F2"],
    key_f13: ["kf13", "F3"],
    key_f14: ["kf14", "F4"],
    key_f15: ["kf15", "F5"],
    key_f16: ["kf16", "F6"],
    key_f17: ["kf17", "F7"],
    key_f18: ["kf18", "F8"],
    key_f19: ["kf19", "F9"],
    key_f2: ["kf2", "k2"],
    key_f20: ["kf20", "FA"],
    key_f21: ["kf21", "FB"],
    key_f22: ["kf22", "FC"],
    key_f23: ["kf23", "FD"],
    key_f24: ["kf24", "FE"],
    key_f25: ["kf25", "FF"],
    key_f26: ["kf26", "FG"],
    key_f27: ["kf27", "FH"],
    key_f28: ["kf28", "FI"],
    key_f29: ["kf29", "FJ"],
    key_f3: ["kf3", "k3"],
    key_f30: ["kf30", "FK"],
    key_f31: ["kf31", "FL"],
    key_f32: ["kf32", "FM"],
    key_f33: ["kf33", "FN"],
    key_f34: ["kf34", "FO"],
    key_f35: ["kf35", "FP"],
    key_f36: ["kf36", "FQ"],
    key_f37: ["kf37", "FR"],
    key_f38: ["kf38", "FS"],
    key_f39: ["kf39", "FT"],
    key_f4: ["kf4", "k4"],
    key_f40: ["kf40", "FU"],
    key_f41: ["kf41", "FV"],
    key_f42: ["kf42", "FW"],
    key_f43: ["kf43", "FX"],
    key_f44: ["kf44", "FY"],
    key_f45: ["kf45", "FZ"],
    key_f46: ["kf46", "Fa"],
    key_f47: ["kf47", "Fb"],
    key_f48: ["kf48", "Fc"],
    key_f49: ["kf49", "Fd"],
    key_f5: ["kf5", "k5"],
    key_f50: ["kf50", "Fe"],
    key_f51: ["kf51", "Ff"],
    key_f52: ["kf52", "Fg"],
    key_f53: ["kf53", "Fh"],
    key_f54: ["kf54", "Fi"],
    key_f55: ["kf55", "Fj"],
    key_f56: ["kf56", "Fk"],
    key_f57: ["kf57", "Fl"],
    key_f58: ["kf58", "Fm"],
    key_f59: ["kf59", "Fn"],
    key_f6: ["kf6", "k6"],
    key_f60: ["kf60", "Fo"],
    key_f61: ["kf61", "Fp"],
    key_f62: ["kf62", "Fq"],
    key_f63: ["kf63", "Fr"],
    key_f7: ["kf7", "k7"],
    key_f8: ["kf8", "k8"],
    key_f9: ["kf9", "k9"],
    key_find: ["kfnd", "@0"],
    key_help: ["khlp", "%1"],
    key_home: ["khome", "kh"],
    key_ic: ["kich1", "kI"],
    key_il: ["kil1", "kA"],
    key_left: ["kcub1", "kl"],
    key_ll: ["kll", "kH"],
    key_mark: ["kmrk", "%2"],
    key_message: ["kmsg", "%3"],
    key_move: ["kmov", "%4"],
    key_next: ["knxt", "%5"],
    key_npage: ["knp", "kN"],
    key_open: ["kopn", "%6"],
    key_options: ["kopt", "%7"],
    key_ppage: ["kpp", "kP"],
    key_previous: ["kprv", "%8"],
    key_print: ["kprt", "%9"],
    key_redo: ["krdo", "%0"],
    key_reference: ["kref", "&1"],
    key_refresh: ["krfr", "&2"],
    key_replace: ["krpl", "&3"],
    key_restart: ["krst", "&4"],
    key_resume: ["kres", "&5"],
    key_right: ["kcuf1", "kr"],
    key_save: ["ksav", "&6"],
    key_sbeg: ["kBEG", "&9"],
    key_scancel: ["kCAN", "&0"],
    key_scommand: ["kCMD", "*1"],
    key_scopy: ["kCPY", "*2"],
    key_screate: ["kCRT", "*3"],
    key_sdc: ["kDC", "*4"],
    key_sdl: ["kDL", "*5"],
    key_select: ["kslt", "*6"],
    key_send: ["kEND", "*7"],
    key_seol: ["kEOL", "*8"],
    key_sexit: ["kEXT", "*9"],
    key_sf: ["kind", "kF"],
    key_sfind: ["kFND", "*0"],
    key_shelp: ["kHLP", "#1"],
    key_shome: ["kHOM", "#2"],
    key_sic: ["kIC", "#3"],
    key_sleft: ["kLFT", "#4"],
    key_smessage: ["kMSG", "%a"],
    key_smove: ["kMOV", "%b"],
    key_snext: ["kNXT", "%c"],
    key_soptions: ["kOPT", "%d"],
    key_sprevious: ["kPRV", "%e"],
    key_sprint: ["kPRT", "%f"],
    key_sr: ["kri", "kR"],
    key_sredo: ["kRDO", "%g"],
    key_sreplace: ["kRPL", "%h"],
    key_sright: ["kRIT", "%i"],
    key_srsume: ["kRES", "%j"],
    key_ssave: ["kSAV", "!1"],
    key_ssuspend: ["kSPD", "!2"],
    key_stab: ["khts", "kT"],
    key_sundo: ["kUND", "!3"],
    key_suspend: ["kspd", "&7"],
    key_undo: ["kund", "&8"],
    key_up: ["kcuu1", "ku"],
    keypad_local: ["rmkx", "ke"],
    keypad_xmit: ["smkx", "ks"],
    lab_f0: ["lf0", "l0"],
    lab_f1: ["lf1", "l1"],
    lab_f10: ["lf10", "la"],
    lab_f2: ["lf2", "l2"],
    lab_f3: ["lf3", "l3"],
    lab_f4: ["lf4", "l4"],
    lab_f5: ["lf5", "l5"],
    lab_f6: ["lf6", "l6"],
    lab_f7: ["lf7", "l7"],
    lab_f8: ["lf8", "l8"],
    lab_f9: ["lf9", "l9"],
    label_format: ["fln", "Lf"],
    label_off: ["rmln", "LF"],
    label_on: ["smln", "LO"],
    meta_off: ["rmm", "mo"],
    meta_on: ["smm", "mm"],
    micro_column_address: ["mhpa", "ZY"],
    micro_down: ["mcud1", "ZZ"],
    micro_left: ["mcub1", "Za"],
    micro_right: ["mcuf1", "Zb"],
    micro_row_address: ["mvpa", "Zc"],
    micro_up: ["mcuu1", "Zd"],
    newline: ["nel", "nw"],
    order_of_pins: ["porder", "Ze"],
    orig_colors: ["oc", "oc"],
    orig_pair: ["op", "op"],
    pad_char: ["pad", "pc"],
    parm_dch: ["dch", "DC"],
    parm_delete_line: ["dl", "DL"],
    parm_down_cursor: ["cud", "DO"],
    parm_down_micro: ["mcud", "Zf"],
    parm_ich: ["ich", "IC"],
    parm_index: ["indn", "SF"],
    parm_insert_line: ["il", "AL"],
    parm_left_cursor: ["cub", "LE"],
    parm_left_micro: ["mcub", "Zg"],
    parm_right_cursor: ["cuf", "RI"],
    parm_right_micro: ["mcuf", "Zh"],
    parm_rindex: ["rin", "SR"],
    parm_up_cursor: ["cuu", "UP"],
    parm_up_micro: ["mcuu", "Zi"],
    pkey_key: ["pfkey", "pk"],
    pkey_local: ["pfloc", "pl"],
    pkey_xmit: ["pfx", "px"],
    plab_norm: ["pln", "pn"],
    print_screen: ["mc0", "ps"],
    prtr_non: ["mc5p", "pO"],
    prtr_off: ["mc4", "pf"],
    prtr_on: ["mc5", "po"],
    pulse: ["pulse", "PU"],
    quick_dial: ["qdial", "QD"],
    remove_clock: ["rmclk", "RC"],
    repeat_char: ["rep", "rp"],
    req_for_input: ["rfi", "RF"],
    reset_1string: ["rs1", "r1"],
    reset_2string: ["rs2", "r2"],
    reset_3string: ["rs3", "r3"],
    reset_file: ["rf", "rf"],
    restore_cursor: ["rc", "rc"],
    row_address: ["vpa", "cv"],
    save_cursor: ["sc", "sc"],
    scroll_forward: ["ind", "sf"],
    scroll_reverse: ["ri", "sr"],
    select_char_set: ["scs", "Zj"],
    set_attributes: ["sgr", "sa"],
    set_background: ["setb", "Sb"],
    set_bottom_margin: ["smgb", "Zk"],
    set_bottom_margin_parm: ["smgbp", "Zl"],
    set_clock: ["sclk", "SC"],
    set_color_pair: ["scp", "sp"],
    set_foreground: ["setf", "Sf"],
    set_left_margin: ["smgl", "ML"],
    set_left_margin_parm: ["smglp", "Zm"],
    set_right_margin: ["smgr", "MR"],
    set_right_margin_parm: ["smgrp", "Zn"],
    set_tab: ["hts", "st"],
    set_top_margin: ["smgt", "Zo"],
    set_top_margin_parm: ["smgtp", "Zp"],
    set_window: ["wind", "wi"],
    start_bit_image: ["sbim", "Zq"],
    start_char_set_def: ["scsd", "Zr"],
    stop_bit_image: ["rbim", "Zs"],
    stop_char_set_def: ["rcsd", "Zt"],
    subscript_characters: ["subcs", "Zu"],
    superscript_characters: ["supcs", "Zv"],
    tab: ["ht", "ta"],
    these_cause_cr: ["docr", "Zw"],
    to_status_line: ["tsl", "ts"],
    tone: ["tone", "TO"],
    underline_char: ["uc", "uc"],
    up_half_line: ["hu", "hu"],
    user0: ["u0", "u0"],
    user1: ["u1", "u1"],
    user2: ["u2", "u2"],
    user3: ["u3", "u3"],
    user4: ["u4", "u4"],
    user5: ["u5", "u5"],
    user6: ["u6", "u6"],
    user7: ["u7", "u7"],
    user8: ["u8", "u8"],
    user9: ["u9", "u9"],
    wait_tone: ["wait", "WA"],
    xoff_character: ["xoffc", "XF"],
    xon_character: ["xonc", "XN"],
    zero_motion: ["zerom", "Zx"],
    alt_scancode_esc: ["scesa", "S8"],
    bit_image_carriage_return: ["bicr", "Yv"],
    bit_image_newline: ["binel", "Zz"],
    bit_image_repeat: ["birep", "Xy"],
    char_set_names: ["csnm", "Zy"],
    code_set_init: ["csin", "ci"],
    color_names: ["colornm", "Yw"],
    define_bit_image_region: ["defbi", "Yx"],
    device_type: ["devt", "dv"],
    display_pc_char: ["dispc", "S1"],
    end_bit_image_region: ["endbi", "Yy"],
    enter_pc_charset_mode: ["smpch", "S2"],
    enter_scancode_mode: ["smsc", "S4"],
    exit_pc_charset_mode: ["rmpch", "S3"],
    exit_scancode_mode: ["rmsc", "S5"],
    get_mouse: ["getm", "Gm"],
    key_mouse: ["kmous", "Km"],
    mouse_info: ["minfo", "Mi"],
    pc_term_options: ["pctrm", "S6"],
    pkey_plab: ["pfxl", "xl"],
    req_mouse_pos: ["reqmp", "RQ"],
    scancode_escape: ["scesc", "S7"],
    set0_des_seq: ["s0ds", "s0"],
    set1_des_seq: ["s1ds", "s1"],
    set2_des_seq: ["s2ds", "s2"],
    set3_des_seq: ["s3ds", "s3"],
    set_a_background: ["setab", "AB"],
    set_a_foreground: ["setaf", "AF"],
    set_color_band: ["setcolor", "Yz"],
    set_lr_margin: ["smglr", "ML"],
    set_page_length: ["slines", "YZ"],
    set_tb_margin: ["smgtb", "MT"],
    enter_horizontal_hl_mode: ["ehhlm", "Xh"],
    enter_left_hl_mode: ["elhlm", "Xl"],
    enter_low_hl_mode: ["elohlm", "Xo"],
    enter_right_hl_mode: ["erhlm", "Xr"],
    enter_top_hl_mode: ["ethlm", "Xt"],
    enter_vertical_hl_mode: ["evhlm", "Xv"],
    set_a_attributes: ["sgr1", "sA"],
    set_pglen_inch: ["slength", "sL"]
  };
});

// node_modules/neo-blessed/lib/tput.js
var require_tput = __commonJS((exports, module) => {
  var __dirname = "/home/jorge/repos/ainm/tasks/tripletex/node_modules/neo-blessed/lib";
  var assert = __require("assert");
  var path = __require("path");
  var fs = __require("fs");
  var cp = __require("child_process");
  function Tput(options) {
    if (!(this instanceof Tput)) {
      return new Tput(options);
    }
    options = options || {};
    if (typeof options === "string") {
      options = { terminal: options };
    }
    this.options = options;
    this.terminal = options.terminal || options.term || process.env.TERM || (process.platform === "win32" ? "windows-ansi" : "xterm");
    this.terminal = this.terminal.toLowerCase();
    this.debug = options.debug;
    this.padding = options.padding;
    this.extended = options.extended;
    this.printf = options.printf;
    this.termcap = options.termcap;
    this.error = null;
    this.terminfoPrefix = options.terminfoPrefix;
    this.terminfoFile = options.terminfoFile;
    this.termcapFile = options.termcapFile;
    if (options.terminal || options.term) {
      this.setup();
    }
  }
  Tput.prototype.setup = function() {
    this.error = null;
    try {
      if (this.termcap) {
        try {
          this.injectTermcap();
        } catch (e) {
          if (this.debug)
            throw e;
          this.error = new Error("Termcap parse error.");
          this._useInternalCap(this.terminal);
        }
      } else {
        try {
          this.injectTerminfo();
        } catch (e) {
          if (this.debug)
            throw e;
          this.error = new Error("Terminfo parse error.");
          this._useInternalInfo(this.terminal);
        }
      }
    } catch (e) {
      if (this.debug)
        throw e;
      this.error = new Error("Terminfo not found.");
      this._useXtermInfo();
    }
  };
  Tput.prototype.term = function(is) {
    return this.terminal.indexOf(is) === 0;
  };
  Tput.prototype._debug = function() {
    if (!this.debug)
      return;
    return console.log.apply(console, arguments);
  };
  Tput.prototype._useVt102Cap = function() {
    return this.injectTermcap("vt102");
  };
  Tput.prototype._useXtermCap = function() {
    return this.injectTermcap(__dirname + "/../usr/xterm.termcap");
  };
  Tput.prototype._useXtermInfo = function() {
    return this.injectTerminfo(__dirname + "/../usr/xterm");
  };
  Tput.prototype._useInternalInfo = function(name) {
    name = path.basename(name);
    return this.injectTerminfo(__dirname + "/../usr/" + name);
  };
  Tput.prototype._useInternalCap = function(name) {
    name = path.basename(name);
    return this.injectTermcap(__dirname + "/../usr/" + name + ".termcap");
  };
  Tput.ipaths = [
    process.env.TERMINFO || "",
    (process.env.TERMINFO_DIRS || "").split(":"),
    (process.env.HOME || "") + "/.terminfo",
    "/usr/share/terminfo",
    "/usr/share/lib/terminfo",
    "/usr/lib/terminfo",
    "/usr/local/share/terminfo",
    "/usr/local/share/lib/terminfo",
    "/usr/local/lib/terminfo",
    "/usr/local/ncurses/lib/terminfo",
    "/lib/terminfo"
  ];
  Tput.prototype.readTerminfo = function(term) {
    var data, file, info;
    term = term || this.terminal;
    file = path.normalize(this._prefix(term));
    data = fs.readFileSync(file);
    info = this.parseTerminfo(data, file);
    if (this.debug) {
      this._terminfo = info;
    }
    return info;
  };
  Tput._prefix = Tput.prototype._prefix = function(term) {
    if (term) {
      if (~term.indexOf(path.sep)) {
        return term;
      }
      if (this.terminfoFile) {
        return this.terminfoFile;
      }
    }
    var paths = Tput.ipaths.slice(), file;
    if (this.terminfoPrefix) {
      paths.unshift(this.terminfoPrefix);
    }
    file = this._tprefix(paths, term);
    if (file)
      return file;
    file = this._tprefix(paths, term, true);
    if (file)
      return file;
    throw new Error("Terminfo directory not found.");
  };
  Tput._tprefix = Tput.prototype._tprefix = function(prefix, term, soft) {
    if (!prefix)
      return;
    var file, dir, i, sdiff, sfile, list;
    if (Array.isArray(prefix)) {
      for (i = 0;i < prefix.length; i++) {
        file = this._tprefix(prefix[i], term, soft);
        if (file)
          return file;
      }
      return;
    }
    var find = function(word) {
      var file2, ch;
      file2 = path.resolve(prefix, word[0]);
      try {
        fs.statSync(file2);
        return file2;
      } catch (e) {}
      ch = word[0].charCodeAt(0).toString(16);
      if (ch.length < 2)
        ch = "0" + ch;
      file2 = path.resolve(prefix, ch);
      try {
        fs.statSync(file2);
        return file2;
      } catch (e) {}
    };
    if (!term) {
      try {
        dir = fs.readdirSync(prefix).filter(function(file2) {
          return file2.length !== 1 && !/^[0-9a-fA-F]{2}$/.test(file2);
        });
        if (!dir.length) {
          return prefix;
        }
      } catch (e) {}
      return;
    }
    term = path.basename(term);
    dir = find(term);
    if (!dir)
      return;
    if (soft) {
      try {
        list = fs.readdirSync(dir);
      } catch (e) {
        return;
      }
      list.forEach(function(file2) {
        if (file2.indexOf(term) === 0) {
          var diff = file2.length - term.length;
          if (!sfile || diff < sdiff) {
            sdiff = diff;
            sfile = file2;
          }
        }
      });
      return sfile && (soft || sdiff === 0) ? path.resolve(dir, sfile) : null;
    }
    file = path.resolve(dir, term);
    try {
      fs.statSync(file);
      return file;
    } catch (e) {}
  };
  Tput.prototype.parseTerminfo = function(data, file) {
    var info = {}, extended, l = data.length, i = 0, v, o;
    var h = info.header = {
      dataSize: data.length,
      headerSize: 12,
      magicNumber: data[1] << 8 | data[0],
      namesSize: data[3] << 8 | data[2],
      boolCount: data[5] << 8 | data[4],
      numCount: data[7] << 8 | data[6],
      strCount: data[9] << 8 | data[8],
      strTableSize: data[11] << 8 | data[10]
    };
    h.total = h.headerSize + h.namesSize + h.boolCount + h.numCount * 2 + h.strCount * 2 + h.strTableSize;
    i += h.headerSize;
    var names = data.toString("ascii", i, i + h.namesSize - 1), parts = names.split("|"), name = parts[0], desc = parts.pop();
    info.name = name;
    info.names = parts;
    info.desc = desc;
    info.dir = path.resolve(file, "..", "..");
    info.file = file;
    i += h.namesSize - 1;
    assert.equal(data[i], 0);
    i++;
    info.bools = {};
    l = i + h.boolCount;
    o = 0;
    for (;i < l; i++) {
      v = Tput.bools[o++];
      info.bools[v] = data[i] === 1;
    }
    if (i % 2) {
      assert.equal(data[i], 0);
      i++;
    }
    info.numbers = {};
    l = i + h.numCount * 2;
    o = 0;
    for (;i < l; i += 2) {
      v = Tput.numbers[o++];
      if (data[i + 1] === 255 && data[i] === 255) {
        info.numbers[v] = -1;
      } else {
        info.numbers[v] = data[i + 1] << 8 | data[i];
      }
    }
    info.strings = {};
    l = i + h.strCount * 2;
    o = 0;
    for (;i < l; i += 2) {
      v = Tput.strings[o++];
      if (data[i + 1] === 255 && data[i] === 255) {
        info.strings[v] = -1;
      } else {
        info.strings[v] = data[i + 1] << 8 | data[i];
      }
    }
    Object.keys(info.strings).forEach(function(key) {
      if (info.strings[key] === -1) {
        delete info.strings[key];
        return;
      }
      if (info.strings[key] === 65534) {
        delete info.strings[key];
        return;
      }
      var s = i + info.strings[key], j = s;
      while (data[j])
        j++;
      assert(j < data.length);
      info.strings[key] = data.toString("ascii", s, j);
    });
    if (this.extended !== false) {
      i--;
      i += h.strTableSize;
      if (i % 2) {
        assert.equal(data[i], 0);
        i++;
      }
      l = data.length;
      if (i < l - 1) {
        try {
          extended = this.parseExtended(data.slice(i));
        } catch (e) {
          if (this.debug) {
            throw e;
          }
          return info;
        }
        info.header.extended = extended.header;
        ["bools", "numbers", "strings"].forEach(function(key) {
          merge(info[key], extended[key]);
        });
      }
    }
    return info;
  };
  Tput.prototype.parseExtended = function(data) {
    var info = {}, l = data.length, i = 0;
    var h = info.header = {
      dataSize: data.length,
      headerSize: 10,
      boolCount: data[i + 1] << 8 | data[i + 0],
      numCount: data[i + 3] << 8 | data[i + 2],
      strCount: data[i + 5] << 8 | data[i + 4],
      strTableSize: data[i + 7] << 8 | data[i + 6],
      lastStrTableOffset: data[i + 9] << 8 | data[i + 8]
    };
    h.total = h.headerSize + h.boolCount + h.numCount * 2 + h.strCount * 2 + h.strTableSize;
    i += h.headerSize;
    var _bools = [];
    l = i + h.boolCount;
    for (;i < l; i++) {
      _bools.push(data[i] === 1);
    }
    if (i % 2) {
      assert.equal(data[i], 0);
      i++;
    }
    var _numbers = [];
    l = i + h.numCount * 2;
    for (;i < l; i += 2) {
      if (data[i + 1] === 255 && data[i] === 255) {
        _numbers.push(-1);
      } else {
        _numbers.push(data[i + 1] << 8 | data[i]);
      }
    }
    var _strings = [];
    l = i + h.strCount * 2;
    for (;i < l; i += 2) {
      if (data[i + 1] === 255 && data[i] === 255) {
        _strings.push(-1);
      } else {
        _strings.push(data[i + 1] << 8 | data[i]);
      }
    }
    i = data.length - h.lastStrTableOffset;
    var high = 0;
    _strings.forEach(function(offset, k) {
      if (offset === -1) {
        _strings[k] = "";
        return;
      }
      var s = i + offset, j2 = s;
      while (data[j2])
        j2++;
      assert(j2 < data.length);
      if (high < j2 - i) {
        high = j2 - i;
      }
      _strings[k] = data.toString("ascii", s, j2);
    });
    i += high + 1;
    l = data.length;
    var sym = [], j;
    for (;i < l; i++) {
      j = i;
      while (data[j])
        j++;
      sym.push(data.toString("ascii", i, j));
      i = j;
    }
    j = 0;
    info.bools = {};
    _bools.forEach(function(bool) {
      info.bools[sym[j++]] = bool;
    });
    info.numbers = {};
    _numbers.forEach(function(number) {
      info.numbers[sym[j++]] = number;
    });
    info.strings = {};
    _strings.forEach(function(string) {
      info.strings[sym[j++]] = string;
    });
    assert.equal(i, data.length);
    return info;
  };
  Tput.prototype.compileTerminfo = function(term) {
    return this.compile(this.readTerminfo(term));
  };
  Tput.prototype.injectTerminfo = function(term) {
    return this.inject(this.compileTerminfo(term));
  };
  Tput.prototype.compile = function(info) {
    var self = this;
    if (!info) {
      throw new Error("Terminal not found.");
    }
    this.detectFeatures(info);
    this._debug(info);
    info.all = {};
    info.methods = {};
    ["bools", "numbers", "strings"].forEach(function(type) {
      Object.keys(info[type]).forEach(function(key) {
        info.all[key] = info[type][key];
        info.methods[key] = self._compile(info, key, info.all[key]);
      });
    });
    Tput.bools.forEach(function(key) {
      if (info.methods[key] == null)
        info.methods[key] = false;
    });
    Tput.numbers.forEach(function(key) {
      if (info.methods[key] == null)
        info.methods[key] = -1;
    });
    Tput.strings.forEach(function(key) {
      if (!info.methods[key])
        info.methods[key] = noop;
    });
    Object.keys(info.methods).forEach(function(key) {
      if (!Tput.alias[key])
        return;
      Tput.alias[key].forEach(function(alias) {
        info.methods[alias] = info.methods[key];
      });
    });
    return info;
  };
  Tput.prototype.inject = function(info) {
    var self = this, methods = info.methods || info;
    Object.keys(methods).forEach(function(key) {
      if (typeof methods[key] !== "function") {
        self[key] = methods[key];
        return;
      }
      self[key] = function() {
        var args = Array.prototype.slice.call(arguments);
        return methods[key].call(self, args);
      };
    });
    this.info = info;
    this.all = info.all;
    this.methods = info.methods;
    this.bools = info.bools;
    this.numbers = info.numbers;
    this.strings = info.strings;
    if (!~info.names.indexOf(this.terminal)) {
      this.terminal = info.name;
    }
    this.features = info.features;
    Object.keys(info.features).forEach(function(key) {
      if (key === "padding") {
        if (!info.features.padding && self.options.padding !== true) {
          self.padding = false;
        }
        return;
      }
      self[key] = info.features[key];
    });
  };
  Tput.prototype._compile = function(info, key, str) {
    var v;
    this._debug("Compiling %s: %s", key, JSON.stringify(str));
    switch (typeof str) {
      case "boolean":
        return str;
      case "number":
        return str;
      case "string":
        break;
      default:
        return noop;
    }
    if (!str) {
      return noop;
    }
    if (key === "init_file" || key === "reset_file") {
      try {
        str = fs.readFileSync(str, "utf8");
        if (this.debug) {
          v = ("return " + JSON.stringify(str) + ";").replace(/\x1b/g, "\\x1b").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
          process.stdout.write(v + `
`);
        }
        return function() {
          return str;
        };
      } catch (e) {
        return noop;
      }
    }
    var tkey = info.name + "." + key, header = "var v, dyn = {}, stat = {}, stack = [], out = [];", footer = ';return out.join("");', code = header, val = str, buff = "", cap, ch, fi, then, els, end;
    function read(regex, no) {
      cap = regex.exec(val);
      if (!cap)
        return;
      val = val.substring(cap[0].length);
      ch = cap[1];
      if (!no)
        clear();
      return cap;
    }
    function stmt(c) {
      if (code[code.length - 1] === ",") {
        code = code.slice(0, -1);
      }
      code += c;
    }
    function expr(c) {
      code += c + ",";
    }
    function echo(c) {
      if (c === '""')
        return;
      expr("out.push(" + c + ")");
    }
    function print(c) {
      buff += c;
    }
    function clear() {
      if (buff) {
        echo(JSON.stringify(buff).replace(/\\u00([0-9a-fA-F]{2})/g, "\\x$1"));
        buff = "";
      }
    }
    while (val) {
      if (read(/^\n /, true)) {
        continue;
      }
      if (read(/^\^(.)/i, true)) {
        if (!(ch >= " " && ch <= "~")) {
          this._debug("%s: bad caret char.", tkey);
          print(cap[0]);
          continue;
        }
        if (ch === "?") {
          ch = "\x7F";
        } else {
          ch = ch.charCodeAt(0) & 31;
          if (ch === 0)
            ch = 128;
          ch = String.fromCharCode(ch);
        }
        print(ch);
        continue;
      }
      if (read(/^\\([0-7]{3})/, true)) {
        print(String.fromCharCode(parseInt(ch, 8)));
        continue;
      }
      if (read(/^\\([eEnlrtbfs\^\\,:0]|.)/, true)) {
        switch (ch) {
          case "e":
          case "E":
            ch = "\x1B";
            break;
          case "n":
            ch = `
`;
            break;
          case "l":
            ch = "\x85";
            break;
          case "r":
            ch = "\r";
            break;
          case "t":
            ch = "\t";
            break;
          case "b":
            ch = "\b";
            break;
          case "f":
            ch = "\f";
            break;
          case "s":
            ch = " ";
            break;
          case "^":
            ch = "^";
            break;
          case "\\":
            ch = "\\";
            break;
          case ",":
            ch = ",";
            break;
          case ":":
            ch = ":";
            break;
          case "0":
            ch = "\x80";
            break;
          case "a":
            ch = "\x07";
            break;
          default:
            this._debug("%s: bad backslash char.", tkey);
            ch = cap[0];
            break;
        }
        print(ch);
        continue;
      }
      if (read(/^\$<(\d+)([*\/]{0,2})>/, true)) {
        if (this.padding)
          print(cap[0]);
        continue;
      }
      if (read(/^%%/, true)) {
        print("%");
        continue;
      }
      if (read(/^%((?::-|[+# ]){1,4})?(\d+(?:\.\d+)?)?([doxXsc])/)) {
        if (this.printf || cap[1] || cap[2] || ~"oxX".indexOf(cap[3])) {
          echo('sprintf("' + cap[0].replace(":-", "-") + '", stack.pop())');
        } else if (cap[3] === "c") {
          echo("(v = stack.pop(), isFinite(v) " + '? String.fromCharCode(v || 0200) : "")');
        } else {
          echo("stack.pop()");
        }
        continue;
      }
      if (read(/^%p([1-9])/)) {
        expr("(stack.push(v = params[" + (ch - 1) + "]), v)");
        continue;
      }
      if (read(/^%P([a-z])/)) {
        expr("dyn." + ch + " = stack.pop()");
        continue;
      }
      if (read(/^%g([a-z])/)) {
        expr("(stack.push(dyn." + ch + "), dyn." + ch + ")");
        continue;
      }
      if (read(/^%P([A-Z])/)) {
        expr("stat." + ch + " = stack.pop()");
        continue;
      }
      if (read(/^%g([A-Z])/)) {
        expr("(stack.push(v = stat." + ch + "), v)");
        continue;
      }
      if (read(/^%'(.)'/)) {
        expr("(stack.push(v = " + ch.charCodeAt(0) + "), v)");
        continue;
      }
      if (read(/^%\{(\d+)\}/)) {
        expr("(stack.push(v = " + ch + "), v)");
        continue;
      }
      if (read(/^%l/)) {
        expr('(stack.push(v = (stack.pop() || "").length || 0), v)');
        continue;
      }
      if (read(/^%([+\-*\/m&|\^=><])/)) {
        if (ch === "=")
          ch = "===";
        else if (ch === "m")
          ch = "%";
        expr("(v = stack.pop()," + " stack.push(v = (stack.pop() " + ch + " v) || 0)," + " v)");
        continue;
      }
      if (read(/^%([AO])/)) {
        expr("(stack.push(v = (stack.pop() " + (ch === "A" ? "&&" : "||") + " stack.pop())), v)");
        continue;
      }
      if (read(/^%([!~])/)) {
        expr("(stack.push(v = " + ch + "stack.pop()), v)");
        continue;
      }
      if (read(/^%i/)) {
        expr("(params[0]++, params[1]++)");
        continue;
      }
      if (read(/^%\?/)) {
        end = -1;
        stmt(";if (");
        continue;
      }
      if (read(/^%t/)) {
        end = -1;
        stmt(") {");
        continue;
      }
      if (read(/^%e/)) {
        fi = val.indexOf("%?");
        then = val.indexOf("%t");
        els = val.indexOf("%e");
        end = val.indexOf("%;");
        if (end === -1)
          end = Infinity;
        if (then !== -1 && then < end && (fi === -1 || then < fi) && (els === -1 || then < els)) {
          stmt("} else if (");
        } else {
          stmt("} else {");
        }
        continue;
      }
      if (read(/^%;/)) {
        end = null;
        stmt("}");
        continue;
      }
      buff += val[0];
      val = val.substring(1);
    }
    clear();
    if (end != null) {
      stmt("}");
    }
    stmt(footer);
    v = code.slice(header.length, -footer.length);
    if (!v.length) {
      code = 'return "";';
    } else if (v = /^out\.push\(("(?:[^"]|\\")+")\)$/.exec(v)) {
      code = "return " + v[1] + ";";
    } else {
      code = code.replace(/\(stack\.push\(v = params\[(\d+)\]\), v\),out\.push\(stack\.pop\(\)\)/g, "out.push(params[$1])");
      v = code.slice(header.length, -footer.length);
      if (!~v.indexOf("v = "))
        code = code.replace("v, ", "");
      if (!~v.indexOf("dyn"))
        code = code.replace("dyn = {}, ", "");
      if (!~v.indexOf("stat"))
        code = code.replace("stat = {}, ", "");
      if (!~v.indexOf("stack"))
        code = code.replace("stack = [], ", "");
      code = code.replace(/out = \[\];out\.push\(("(?:[^"]|\\")+")\),/, "out = [$1];");
    }
    if (str === "\x1B%?") {
      code = 'return "\\x1b";';
    }
    if (this.debug) {
      v = code.replace(/\x1b/g, "\\x1b").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
      process.stdout.write(v + `
`);
    }
    try {
      if (this.options.stringify && code.indexOf("return ") === 0) {
        return new Function("", code)();
      }
      return this.printf || ~code.indexOf("sprintf(") ? new Function("sprintf, params", code).bind(null, sprintf) : new Function("params", code);
    } catch (e) {
      console.error("");
      console.error("Error on %s:", tkey);
      console.error(JSON.stringify(str));
      console.error("");
      console.error(code.replace(/(,|;)/g, `$1
`));
      e.stack = e.stack.replace(/\x1b/g, "\\x1b");
      throw e;
    }
  };
  Tput.prototype._print = function(code, print, done) {
    var xon = !this.bools.needs_xon_xoff || this.bools.xon_xoff;
    print = print || write;
    done = done || noop;
    if (!this.padding) {
      print(code);
      return done();
    }
    var parts = code.split(/(?=\$<[\d.]+[*\/]{0,2}>)/), i = 0;
    (function next() {
      if (i === parts.length) {
        return done();
      }
      var part = parts[i++], padding = /^\$<([\d.]+)([*\/]{0,2})>/.exec(part), amount, suffix;
      if (!padding) {
        print(part);
        return next();
      }
      part = part.substring(padding[0].length);
      amount = +padding[1];
      suffix = padding[2];
      if (xon && !~suffix.indexOf("/")) {
        print(part);
        return next();
      }
      if (~suffix.indexOf("*")) {
        amount = amount;
      }
      return setTimeout(function() {
        print(part);
        return next();
      }, amount);
    })();
  };
  Tput.print = function() {
    var fake = {
      padding: true,
      bools: { needs_xon_xoff: true, xon_xoff: false }
    };
    return Tput.prototype._print.apply(fake, arguments);
  };
  Tput.cpaths = [
    process.env.TERMCAP || "",
    (process.env.TERMPATH || "").split(/[: ]/),
    (process.env.HOME || "") + "/.termcap",
    "/usr/share/misc/termcap",
    "/etc/termcap"
  ];
  Tput.prototype.readTermcap = function(term) {
    var self = this, terms, term_, root, paths;
    term = term || this.terminal;
    if (~term.indexOf(path.sep) && (terms = this._tryCap(path.resolve(term)))) {
      term_ = path.basename(term).split(".")[0];
      if (terms[process.env.TERM]) {
        term = process.env.TERM;
      } else if (terms[term_]) {
        term = term_;
      } else {
        term = Object.keys(terms)[0];
      }
    } else {
      paths = Tput.cpaths.slice();
      if (this.termcapFile) {
        paths.unshift(this.termcapFile);
      }
      paths.push(Tput.termcap);
      terms = this._tryCap(paths, term);
    }
    if (!terms) {
      throw new Error("Cannot find termcap for: " + term);
    }
    root = terms[term];
    if (this.debug) {
      this._termcap = terms;
    }
    (function tc(term2) {
      if (term2 && term2.strings.tc) {
        root.inherits = root.inherits || [];
        root.inherits.push(term2.strings.tc);
        var names = terms[term2.strings.tc] ? terms[term2.strings.tc].names : [term2.strings.tc];
        self._debug("%s inherits from %s.", term2.names.join("/"), names.join("/"));
        var inherit = tc(terms[term2.strings.tc]);
        if (inherit) {
          ["bools", "numbers", "strings"].forEach(function(type) {
            merge(term2[type], inherit[type]);
          });
        }
      }
      return term2;
    })(root);
    root = this.translateTermcap(root);
    return root;
  };
  Tput.prototype._tryCap = function(file, term) {
    if (!file)
      return;
    var terms, data, i;
    if (Array.isArray(file)) {
      for (i = 0;i < file.length; i++) {
        data = this._tryCap(file[i], term);
        if (data)
          return data;
      }
      return;
    }
    data = file[0] === "/" ? tryRead(file) : file;
    if (!data)
      return;
    terms = this.parseTermcap(data, file);
    if (term && !terms[term]) {
      return;
    }
    return terms;
  };
  Tput.prototype.parseTermcap = function(data, file) {
    var terms = {}, parts, term, entries, fields, field, names, i, j, k;
    data = data.replace(/\\\n[ \t]*/g, "");
    data = data.replace(/^#[^\n]+/gm, "");
    entries = data.trim().split(/\n+/);
    for (i = 0;i < entries.length; i++) {
      fields = entries[i].split(/:+/);
      for (j = 0;j < fields.length; j++) {
        field = fields[j].trim();
        if (!field)
          continue;
        if (j === 0) {
          names = field.split("|");
          term = {
            name: names[0],
            names,
            desc: names.pop(),
            file: ~file.indexOf(path.sep) ? path.resolve(file) : file,
            termcap: true
          };
          for (k = 0;k < names.length; k++) {
            terms[names[k]] = term;
          }
          term.bools = {};
          term.numbers = {};
          term.strings = {};
          continue;
        }
        if (~field.indexOf("=")) {
          parts = field.split("=");
          term.strings[parts[0]] = parts.slice(1).join("=");
        } else if (~field.indexOf("#")) {
          parts = field.split("#");
          term.numbers[parts[0]] = +parts.slice(1).join("#");
        } else {
          term.bools[field] = true;
        }
      }
    }
    return terms;
  };
  Tput.prototype.translateTermcap = function(info) {
    var self = this, out = {};
    if (!info)
      return;
    this._debug(info);
    ["name", "names", "desc", "file", "termcap"].forEach(function(key) {
      out[key] = info[key];
    });
    var map = function() {
      var out2 = {};
      Object.keys(Tput.alias).forEach(function(key) {
        var aliases = Tput.alias[key];
        out2[aliases.termcap] = key;
      });
      return out2;
    }();
    ["bools", "numbers", "strings"].forEach(function(key) {
      out[key] = {};
      Object.keys(info[key]).forEach(function(cap) {
        if (key === "strings") {
          info.strings[cap] = self._captoinfo(cap, info.strings[cap], 1);
        }
        if (map[cap]) {
          out[key][map[cap]] = info[key][cap];
        } else {
          out[key][cap] = info[key][cap];
        }
      });
    });
    return out;
  };
  Tput.prototype.compileTermcap = function(term) {
    return this.compile(this.readTermcap(term));
  };
  Tput.prototype.injectTermcap = function(term) {
    return this.inject(this.compileTermcap(term));
  };
  Tput.prototype._captoinfo = function(cap, s, parameterized) {
    var self = this;
    var capstart;
    if (parameterized == null) {
      parameterized = 0;
    }
    var MAX_PUSHED = 16, stack = [];
    var stackptr = 0, onstack = 0, seenm = 0, seenn = 0, seenr = 0, param = 1, i = 0, out = "";
    function warn() {
      var args = Array.prototype.slice.call(arguments);
      args[0] = "captoinfo: " + (args[0] || "");
      return self._debug.apply(self, args);
    }
    function isdigit(ch) {
      return ch >= "0" && ch <= "9";
    }
    function isgraph(ch) {
      return ch > " " && ch <= "~";
    }
    function cvtchar(sp) {
      var c = "\x00", len;
      var j = i;
      switch (sp[j]) {
        case "\\":
          switch (sp[++j]) {
            case "'":
            case "$":
            case "\\":
            case "%":
              c = sp[j];
              len = 2;
              break;
            case "\x00":
              c = "\\";
              len = 1;
              break;
            case "0":
            case "1":
            case "2":
            case "3":
              len = 1;
              while (isdigit(sp[j])) {
                c = String.fromCharCode(8 * c.charCodeAt(0) + (sp[j++].charCodeAt(0) - 48));
                len++;
              }
              break;
            default:
              c = sp[j];
              len = 2;
              break;
          }
          break;
        case "^":
          c = String.fromCharCode(sp[++j].charCodeAt(0) & 31);
          len = 2;
          break;
        default:
          c = sp[j];
          len = 1;
      }
      if (isgraph(c) && c !== "," && c !== "'" && c !== "\\" && c !== ":") {
        out += "%'";
        out += c;
        out += "'";
      } else {
        out += "%{";
        if (c.charCodeAt(0) > 99) {
          out += String.fromCharCode((c.charCodeAt(0) / 100 | 0) + 48);
        }
        if (c.charCodeAt(0) > 9) {
          out += String.fromCharCode((c.charCodeAt(0) / 10 | 0) % 10 + 48);
        }
        out += String.fromCharCode(c.charCodeAt(0) % 10 + 48);
        out += "}";
      }
      return len;
    }
    function getparm(parm, n) {
      if (seenr) {
        if (parm === 1) {
          parm = 2;
        } else if (parm === 2) {
          parm = 1;
        }
      }
      if (onstack === parm) {
        if (n > 1) {
          warn("string may not be optimal");
          out += "%Pa";
          while (n--) {
            out += "%ga";
          }
        }
        return;
      }
      if (onstack !== 0) {
        push();
      }
      onstack = parm;
      while (n--) {
        out += "%p";
        out += String.fromCharCode(48 + parm);
      }
      if (seenn && parm < 3) {
        out += "%{96}%^";
      }
      if (seenm && parm < 3) {
        out += "%{127}%^";
      }
    }
    function push() {
      if (stackptr >= MAX_PUSHED) {
        warn("string too complex to convert");
      } else {
        stack[stackptr++] = onstack;
      }
    }
    function pop() {
      if (stackptr === 0) {
        if (onstack === 0) {
          warn("I'm confused");
        } else {
          onstack = 0;
        }
      } else {
        onstack = stack[--stackptr];
      }
      param++;
    }
    function see03() {
      getparm(param, 1);
      out += "%3d";
      pop();
    }
    function invalid() {
      out += "%";
      i--;
      warn("unknown %% code %s (%#x) in %s", JSON.stringify(s[i]), s[i].charCodeAt(0), cap);
    }
    capstart = null;
    if (s == null)
      s = "";
    if (parameterized >= 0 && isdigit(s[i])) {
      for (capstart = i;; i++) {
        if (!(isdigit(s[i]) || s[i] === "*" || s[i] === ".")) {
          break;
        }
      }
    }
    while (s[i]) {
      switch (s[i]) {
        case "%":
          i++;
          if (parameterized < 1) {
            out += "%";
            break;
          }
          switch (s[i++]) {
            case "%":
              out += "%";
              break;
            case "r":
              if (seenr++ === 1) {
                warn("saw %%r twice in %s", cap);
              }
              break;
            case "m":
              if (seenm++ === 1) {
                warn("saw %%m twice in %s", cap);
              }
              break;
            case "n":
              if (seenn++ === 1) {
                warn("saw %%n twice in %s", cap);
              }
              break;
            case "i":
              out += "%i";
              break;
            case "6":
            case "B":
              getparm(param, 1);
              out += "%{10}%/%{16}%*";
              getparm(param, 1);
              out += "%{10}%m%+";
              break;
            case "8":
            case "D":
              getparm(param, 2);
              out += "%{2}%*%-";
              break;
            case ">":
              getparm(param, 2);
              out += "%?";
              i += cvtchar(s);
              out += "%>%t";
              i += cvtchar(s);
              out += "%+%;";
              break;
            case "a":
              if ((s[i] === "=" || s[i] === "+" || s[i] === "-" || s[i] === "*" || s[i] === "/") && (s[i + 1] === "p" || s[i + 1] === "c") && s[i + 2] !== "\x00" && s[i + 2]) {
                var l;
                l = 2;
                if (s[i] !== "=") {
                  getparm(param, 1);
                }
                if (s[i + 1] === "p") {
                  getparm(param + s[i + 2].charCodeAt(0) - 64, 1);
                  if (param !== onstack) {
                    pop();
                    param--;
                  }
                  l++;
                } else {
                  i += 2, l += cvtchar(s), i -= 2;
                }
                switch (s[i]) {
                  case "+":
                    out += "%+";
                    break;
                  case "-":
                    out += "%-";
                    break;
                  case "*":
                    out += "%*";
                    break;
                  case "/":
                    out += "%/";
                    break;
                  case "=":
                    if (seenr) {
                      if (param === 1) {
                        onstack = 2;
                      } else if (param === 2) {
                        onstack = 1;
                      } else {
                        onstack = param;
                      }
                    } else {
                      onstack = param;
                    }
                    break;
                }
                i += l;
                break;
              }
              getparm(param, 1);
              i += cvtchar(s);
              out += "%+";
              break;
            case "+":
              getparm(param, 1);
              i += cvtchar(s);
              out += "%+%c";
              pop();
              break;
            case "s":
              getparm(param, 1);
              out += "%s";
              pop();
              break;
            case "-":
              i += cvtchar(s);
              getparm(param, 1);
              out += "%-%c";
              pop();
              break;
            case ".":
              getparm(param, 1);
              out += "%c";
              pop();
              break;
            case "0":
              if (s[i] === "3") {
                see03();
                break;
              } else if (s[i] !== "2") {
                invalid();
                break;
              }
            case "2":
              getparm(param, 1);
              out += "%2d";
              pop();
              break;
            case "3":
              see03();
              break;
            case "d":
              getparm(param, 1);
              out += "%d";
              pop();
              break;
            case "f":
              param++;
              break;
            case "b":
              param--;
              break;
            case "\\":
              out += "%\\";
              break;
            default:
              invalid();
              break;
          }
          break;
        default:
          out += s[i++];
          break;
      }
    }
    if (capstart != null) {
      out += "$<";
      for (i = capstart;; i++) {
        if (isdigit(s[i]) || s[i] === "*" || s[i] === ".") {
          out += s[i];
        } else {
          break;
        }
      }
      out += "/>";
    }
    if (s !== out) {
      warn("Translating %s from %s to %s.", cap, JSON.stringify(s), JSON.stringify(out));
    }
    return out;
  };
  Tput.prototype.getAll = function() {
    var dir = this._prefix(), list = asort(fs.readdirSync(dir)), infos = [];
    list.forEach(function(letter) {
      var terms = asort(fs.readdirSync(path.resolve(dir, letter)));
      infos.push.apply(infos, terms);
    });
    function asort(obj) {
      return obj.sort(function(a, b) {
        a = a.toLowerCase().charCodeAt(0);
        b = b.toLowerCase().charCodeAt(0);
        return a - b;
      });
    }
    return infos;
  };
  Tput.prototype.compileAll = function(start) {
    var self = this, all = {};
    this.getAll().forEach(function(name) {
      if (start && name !== start) {
        return;
      } else {
        start = null;
      }
      all[name] = self.compileTerminfo(name);
    });
    return all;
  };
  Tput.prototype.detectFeatures = function(info) {
    var data = this.parseACS(info);
    info.features = {
      unicode: this.detectUnicode(info),
      brokenACS: this.detectBrokenACS(info),
      PCRomSet: this.detectPCRomSet(info),
      magicCookie: this.detectMagicCookie(info),
      padding: this.detectPadding(info),
      setbuf: this.detectSetbuf(info),
      acsc: data.acsc,
      acscr: data.acscr
    };
    return info.features;
  };
  Tput.prototype.detectUnicode = function() {
    if (process.env.NCURSES_FORCE_UNICODE != null) {
      return !!+process.env.NCURSES_FORCE_UNICODE;
    }
    if (this.options.forceUnicode != null) {
      return this.options.forceUnicode;
    }
    var LANG = process.env.LANG + ":" + process.env.LANGUAGE + ":" + process.env.LC_ALL + ":" + process.env.LC_CTYPE;
    return /utf-?8/i.test(LANG) || this.GetConsoleCP() === 65001;
  };
  Tput.prototype.detectBrokenACS = function(info) {
    if (process.env.NCURSES_NO_UTF8_ACS != null) {
      return !!+process.env.NCURSES_NO_UTF8_ACS;
    }
    if (info.numbers.U8 >= 0) {
      return !!info.numbers.U8;
    }
    if (info.name === "linux") {
      return true;
    }
    if (this.detectPCRomSet(info)) {
      return true;
    }
    if (this.termcap && info.name.indexOf("screen") === 0 && process.env.TERMCAP && ~process.env.TERMCAP.indexOf("screen") && ~process.env.TERMCAP.indexOf("hhII00")) {
      if (~info.strings.enter_alt_charset_mode.indexOf("\x0E") || ~info.strings.enter_alt_charset_mode.indexOf("\x0F") || ~info.strings.set_attributes.indexOf("\x0E") || ~info.strings.set_attributes.indexOf("\x0F")) {
        return true;
      }
    }
    return false;
  };
  Tput.prototype.detectPCRomSet = function(info) {
    var s = info.strings;
    if (s.enter_pc_charset_mode && s.enter_alt_charset_mode && s.enter_pc_charset_mode === s.enter_alt_charset_mode && s.exit_pc_charset_mode === s.exit_alt_charset_mode) {
      return true;
    }
    return false;
  };
  Tput.prototype.detectMagicCookie = function() {
    return process.env.NCURSES_NO_MAGIC_COOKIE == null;
  };
  Tput.prototype.detectPadding = function() {
    return process.env.NCURSES_NO_PADDING == null;
  };
  Tput.prototype.detectSetbuf = function() {
    return process.env.NCURSES_NO_SETBUF == null;
  };
  Tput.prototype.parseACS = function(info) {
    var data = {};
    data.acsc = {};
    data.acscr = {};
    if (this.detectPCRomSet(info)) {
      return data;
    }
    Object.keys(Tput.acsc).forEach(function(ch) {
      var acs_chars = info.strings.acs_chars || "", i = acs_chars.indexOf(ch), next = acs_chars[i + 1];
      if (!next || i === -1 || !Tput.acsc[next]) {
        return;
      }
      data.acsc[ch] = Tput.acsc[next];
      data.acscr[Tput.acsc[next]] = ch;
    });
    return data;
  };
  Tput.prototype.GetConsoleCP = function() {
    var ccp;
    if (process.platform !== "win32") {
      return -1;
    }
    if (+process.env.NCURSES_NO_WINDOWS_UNICODE !== 1) {
      return 65001;
    }
    try {
      ccp = cp.execFileSync(process.env.WINDIR + "\\system32\\chcp.com", [], {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "ascii",
        timeout: 1500
      });
    } catch (e) {}
    ccp = /\d+/.exec(ccp);
    if (!ccp) {
      return -1;
    }
    ccp = +ccp[0];
    return ccp;
  };
  function noop() {
    return "";
  }
  noop.unsupported = true;
  function merge(a, b) {
    Object.keys(b).forEach(function(key) {
      a[key] = b[key];
    });
    return a;
  }
  function write(data) {
    return process.stdout.write(data);
  }
  function tryRead(file) {
    if (Array.isArray(file)) {
      for (var i = 0;i < file.length; i++) {
        var data = tryRead(file[i]);
        if (data)
          return data;
      }
      return "";
    }
    if (!file)
      return "";
    file = path.resolve.apply(path, arguments);
    try {
      return fs.readFileSync(file, "utf8");
    } catch (e) {
      return "";
    }
  }
  function sprintf(src) {
    var params = Array.prototype.slice.call(arguments, 1), rule = /%([\-+# ]{1,4})?(\d+(?:\.\d+)?)?([doxXsc])/g, i = 0;
    return src.replace(rule, function(_, flag, width, type) {
      var flags = (flag || "").split(""), param = params[i] != null ? params[i] : "", initial = param, opt = {}, pre = "";
      i++;
      switch (type) {
        case "d":
          param = (+param).toString(10);
          break;
        case "o":
          param = (+param).toString(8);
          break;
        case "x":
          param = (+param).toString(16);
          break;
        case "X":
          param = (+param).toString(16).toUppercase();
          break;
        case "s":
          break;
        case "c":
          param = isFinite(param) ? String.fromCharCode(param || 128) : "";
          break;
      }
      flags.forEach(function(flag2) {
        switch (flag2) {
          case "-":
            opt.left = true;
            break;
          case "+":
            opt.signs = true;
            break;
          case "#":
            opt.hexpoint = true;
            break;
          case " ":
            opt.space = true;
            break;
        }
      });
      width = +width.split(".")[0];
      if (width && !opt.left) {
        param = param + "";
        while (param.length < width) {
          param = "0" + param;
        }
      }
      if (opt.signs) {
        if (+initial >= 0) {
          pre += "+";
        }
      }
      if (opt.space) {
        if (!opt.signs && +initial >= 0) {
          pre += " ";
        }
      }
      if (opt.hexpoint) {
        switch (type) {
          case "o":
            pre += "0";
            break;
          case "x":
            pre += "0x";
            break;
          case "X":
            pre += "0X";
            break;
        }
      }
      if (opt.left) {
        if (width > pre.length + param.length) {
          width -= pre.length + param.length;
          pre = Array(width + 1).join(" ") + pre;
        }
      }
      return pre + param;
    });
  }
  Tput._alias = require_alias();
  Tput.alias = {};
  ["bools", "numbers", "strings"].forEach(function(type) {
    Object.keys(Tput._alias[type]).forEach(function(key) {
      var aliases = Tput._alias[type][key];
      Tput.alias[key] = [aliases[0]];
      Tput.alias[key].terminfo = aliases[0];
      Tput.alias[key].termcap = aliases[1];
    });
  });
  Tput.alias.no_esc_ctlc.push("beehive_glitch");
  Tput.alias.dest_tabs_magic_smso.push("teleray_glitch");
  Tput.alias.micro_col_size.push("micro_char_size");
  Tput.aliasMap = {};
  Object.keys(Tput.alias).forEach(function(key) {
    Tput.aliasMap[key] = key;
    Tput.alias[key].forEach(function(k) {
      Tput.aliasMap[k] = key;
    });
  });
  Tput.prototype.has = function(name) {
    name = Tput.aliasMap[name];
    var val = this.all[name];
    if (!name)
      return false;
    if (typeof val === "number") {
      return val !== -1;
    }
    return !!val;
  };
  Tput.termcap = "" + "vt102|dec vt102:" + ":do=^J:co#80:li#24:cl=50\\E[;H\\E[2J:" + ":le=^H:bs:cm=5\\E[%i%d;%dH:nd=2\\E[C:up=2\\E[A:" + ":ce=3\\E[K:cd=50\\E[J:so=2\\E[7m:se=2\\E[m:us=2\\E[4m:ue=2\\E[m:" + ":md=2\\E[1m:mr=2\\E[7m:mb=2\\E[5m:me=2\\E[m:is=\\E[1;24r\\E[24;1H:" + ":rs=\\E>\\E[?3l\\E[?4l\\E[?5l\\E[?7h\\E[?8h:ks=\\E[?1h\\E=:ke=\\E[?1l\\E>:" + ":ku=\\EOA:kd=\\EOB:kr=\\EOC:kl=\\EOD:kb=^H:\\\n" + ":ho=\\E[H:k1=\\EOP:k2=\\EOQ:k3=\\EOR:k4=\\EOS:pt:sr=5\\EM:vt#3:" + ":sc=\\E7:rc=\\E8:cs=\\E[%i%d;%dr:vs=\\E[?7l:ve=\\E[?7h:" + ":mi:al=\\E[L:dc=\\E[P:dl=\\E[M:ei=\\E[4l:im=\\E[4h:";
  Tput.bools = [
    "auto_left_margin",
    "auto_right_margin",
    "no_esc_ctlc",
    "ceol_standout_glitch",
    "eat_newline_glitch",
    "erase_overstrike",
    "generic_type",
    "hard_copy",
    "has_meta_key",
    "has_status_line",
    "insert_null_glitch",
    "memory_above",
    "memory_below",
    "move_insert_mode",
    "move_standout_mode",
    "over_strike",
    "status_line_esc_ok",
    "dest_tabs_magic_smso",
    "tilde_glitch",
    "transparent_underline",
    "xon_xoff",
    "needs_xon_xoff",
    "prtr_silent",
    "hard_cursor",
    "non_rev_rmcup",
    "no_pad_char",
    "non_dest_scroll_region",
    "can_change",
    "back_color_erase",
    "hue_lightness_saturation",
    "col_addr_glitch",
    "cr_cancels_micro_mode",
    "has_print_wheel",
    "row_addr_glitch",
    "semi_auto_right_margin",
    "cpi_changes_res",
    "lpi_changes_res",
    "backspaces_with_bs",
    "crt_no_scrolling",
    "no_correctly_working_cr",
    "gnu_has_meta_key",
    "linefeed_is_newline",
    "has_hardware_tabs",
    "return_does_clr_eol"
  ];
  Tput.numbers = [
    "columns",
    "init_tabs",
    "lines",
    "lines_of_memory",
    "magic_cookie_glitch",
    "padding_baud_rate",
    "virtual_terminal",
    "width_status_line",
    "num_labels",
    "label_height",
    "label_width",
    "max_attributes",
    "maximum_windows",
    "max_colors",
    "max_pairs",
    "no_color_video",
    "buffer_capacity",
    "dot_vert_spacing",
    "dot_horz_spacing",
    "max_micro_address",
    "max_micro_jump",
    "micro_col_size",
    "micro_line_size",
    "number_of_pins",
    "output_res_char",
    "output_res_line",
    "output_res_horz_inch",
    "output_res_vert_inch",
    "print_rate",
    "wide_char_size",
    "buttons",
    "bit_image_entwining",
    "bit_image_type",
    "magic_cookie_glitch_ul",
    "carriage_return_delay",
    "new_line_delay",
    "backspace_delay",
    "horizontal_tab_delay",
    "number_of_function_keys"
  ];
  Tput.strings = [
    "back_tab",
    "bell",
    "carriage_return",
    "change_scroll_region",
    "clear_all_tabs",
    "clear_screen",
    "clr_eol",
    "clr_eos",
    "column_address",
    "command_character",
    "cursor_address",
    "cursor_down",
    "cursor_home",
    "cursor_invisible",
    "cursor_left",
    "cursor_mem_address",
    "cursor_normal",
    "cursor_right",
    "cursor_to_ll",
    "cursor_up",
    "cursor_visible",
    "delete_character",
    "delete_line",
    "dis_status_line",
    "down_half_line",
    "enter_alt_charset_mode",
    "enter_blink_mode",
    "enter_bold_mode",
    "enter_ca_mode",
    "enter_delete_mode",
    "enter_dim_mode",
    "enter_insert_mode",
    "enter_secure_mode",
    "enter_protected_mode",
    "enter_reverse_mode",
    "enter_standout_mode",
    "enter_underline_mode",
    "erase_chars",
    "exit_alt_charset_mode",
    "exit_attribute_mode",
    "exit_ca_mode",
    "exit_delete_mode",
    "exit_insert_mode",
    "exit_standout_mode",
    "exit_underline_mode",
    "flash_screen",
    "form_feed",
    "from_status_line",
    "init_1string",
    "init_2string",
    "init_3string",
    "init_file",
    "insert_character",
    "insert_line",
    "insert_padding",
    "key_backspace",
    "key_catab",
    "key_clear",
    "key_ctab",
    "key_dc",
    "key_dl",
    "key_down",
    "key_eic",
    "key_eol",
    "key_eos",
    "key_f0",
    "key_f1",
    "key_f10",
    "key_f2",
    "key_f3",
    "key_f4",
    "key_f5",
    "key_f6",
    "key_f7",
    "key_f8",
    "key_f9",
    "key_home",
    "key_ic",
    "key_il",
    "key_left",
    "key_ll",
    "key_npage",
    "key_ppage",
    "key_right",
    "key_sf",
    "key_sr",
    "key_stab",
    "key_up",
    "keypad_local",
    "keypad_xmit",
    "lab_f0",
    "lab_f1",
    "lab_f10",
    "lab_f2",
    "lab_f3",
    "lab_f4",
    "lab_f5",
    "lab_f6",
    "lab_f7",
    "lab_f8",
    "lab_f9",
    "meta_off",
    "meta_on",
    "newline",
    "pad_char",
    "parm_dch",
    "parm_delete_line",
    "parm_down_cursor",
    "parm_ich",
    "parm_index",
    "parm_insert_line",
    "parm_left_cursor",
    "parm_right_cursor",
    "parm_rindex",
    "parm_up_cursor",
    "pkey_key",
    "pkey_local",
    "pkey_xmit",
    "print_screen",
    "prtr_off",
    "prtr_on",
    "repeat_char",
    "reset_1string",
    "reset_2string",
    "reset_3string",
    "reset_file",
    "restore_cursor",
    "row_address",
    "save_cursor",
    "scroll_forward",
    "scroll_reverse",
    "set_attributes",
    "set_tab",
    "set_window",
    "tab",
    "to_status_line",
    "underline_char",
    "up_half_line",
    "init_prog",
    "key_a1",
    "key_a3",
    "key_b2",
    "key_c1",
    "key_c3",
    "prtr_non",
    "char_padding",
    "acs_chars",
    "plab_norm",
    "key_btab",
    "enter_xon_mode",
    "exit_xon_mode",
    "enter_am_mode",
    "exit_am_mode",
    "xon_character",
    "xoff_character",
    "ena_acs",
    "label_on",
    "label_off",
    "key_beg",
    "key_cancel",
    "key_close",
    "key_command",
    "key_copy",
    "key_create",
    "key_end",
    "key_enter",
    "key_exit",
    "key_find",
    "key_help",
    "key_mark",
    "key_message",
    "key_move",
    "key_next",
    "key_open",
    "key_options",
    "key_previous",
    "key_print",
    "key_redo",
    "key_reference",
    "key_refresh",
    "key_replace",
    "key_restart",
    "key_resume",
    "key_save",
    "key_suspend",
    "key_undo",
    "key_sbeg",
    "key_scancel",
    "key_scommand",
    "key_scopy",
    "key_screate",
    "key_sdc",
    "key_sdl",
    "key_select",
    "key_send",
    "key_seol",
    "key_sexit",
    "key_sfind",
    "key_shelp",
    "key_shome",
    "key_sic",
    "key_sleft",
    "key_smessage",
    "key_smove",
    "key_snext",
    "key_soptions",
    "key_sprevious",
    "key_sprint",
    "key_sredo",
    "key_sreplace",
    "key_sright",
    "key_srsume",
    "key_ssave",
    "key_ssuspend",
    "key_sundo",
    "req_for_input",
    "key_f11",
    "key_f12",
    "key_f13",
    "key_f14",
    "key_f15",
    "key_f16",
    "key_f17",
    "key_f18",
    "key_f19",
    "key_f20",
    "key_f21",
    "key_f22",
    "key_f23",
    "key_f24",
    "key_f25",
    "key_f26",
    "key_f27",
    "key_f28",
    "key_f29",
    "key_f30",
    "key_f31",
    "key_f32",
    "key_f33",
    "key_f34",
    "key_f35",
    "key_f36",
    "key_f37",
    "key_f38",
    "key_f39",
    "key_f40",
    "key_f41",
    "key_f42",
    "key_f43",
    "key_f44",
    "key_f45",
    "key_f46",
    "key_f47",
    "key_f48",
    "key_f49",
    "key_f50",
    "key_f51",
    "key_f52",
    "key_f53",
    "key_f54",
    "key_f55",
    "key_f56",
    "key_f57",
    "key_f58",
    "key_f59",
    "key_f60",
    "key_f61",
    "key_f62",
    "key_f63",
    "clr_bol",
    "clear_margins",
    "set_left_margin",
    "set_right_margin",
    "label_format",
    "set_clock",
    "display_clock",
    "remove_clock",
    "create_window",
    "goto_window",
    "hangup",
    "dial_phone",
    "quick_dial",
    "tone",
    "pulse",
    "flash_hook",
    "fixed_pause",
    "wait_tone",
    "user0",
    "user1",
    "user2",
    "user3",
    "user4",
    "user5",
    "user6",
    "user7",
    "user8",
    "user9",
    "orig_pair",
    "orig_colors",
    "initialize_color",
    "initialize_pair",
    "set_color_pair",
    "set_foreground",
    "set_background",
    "change_char_pitch",
    "change_line_pitch",
    "change_res_horz",
    "change_res_vert",
    "define_char",
    "enter_doublewide_mode",
    "enter_draft_quality",
    "enter_italics_mode",
    "enter_leftward_mode",
    "enter_micro_mode",
    "enter_near_letter_quality",
    "enter_normal_quality",
    "enter_shadow_mode",
    "enter_subscript_mode",
    "enter_superscript_mode",
    "enter_upward_mode",
    "exit_doublewide_mode",
    "exit_italics_mode",
    "exit_leftward_mode",
    "exit_micro_mode",
    "exit_shadow_mode",
    "exit_subscript_mode",
    "exit_superscript_mode",
    "exit_upward_mode",
    "micro_column_address",
    "micro_down",
    "micro_left",
    "micro_right",
    "micro_row_address",
    "micro_up",
    "order_of_pins",
    "parm_down_micro",
    "parm_left_micro",
    "parm_right_micro",
    "parm_up_micro",
    "select_char_set",
    "set_bottom_margin",
    "set_bottom_margin_parm",
    "set_left_margin_parm",
    "set_right_margin_parm",
    "set_top_margin",
    "set_top_margin_parm",
    "start_bit_image",
    "start_char_set_def",
    "stop_bit_image",
    "stop_char_set_def",
    "subscript_characters",
    "superscript_characters",
    "these_cause_cr",
    "zero_motion",
    "char_set_names",
    "key_mouse",
    "mouse_info",
    "req_mouse_pos",
    "get_mouse",
    "set_a_foreground",
    "set_a_background",
    "pkey_plab",
    "device_type",
    "code_set_init",
    "set0_des_seq",
    "set1_des_seq",
    "set2_des_seq",
    "set3_des_seq",
    "set_lr_margin",
    "set_tb_margin",
    "bit_image_repeat",
    "bit_image_newline",
    "bit_image_carriage_return",
    "color_names",
    "define_bit_image_region",
    "end_bit_image_region",
    "set_color_band",
    "set_page_length",
    "display_pc_char",
    "enter_pc_charset_mode",
    "exit_pc_charset_mode",
    "enter_scancode_mode",
    "exit_scancode_mode",
    "pc_term_options",
    "scancode_escape",
    "alt_scancode_esc",
    "enter_horizontal_hl_mode",
    "enter_left_hl_mode",
    "enter_low_hl_mode",
    "enter_right_hl_mode",
    "enter_top_hl_mode",
    "enter_vertical_hl_mode",
    "set_a_attributes",
    "set_pglen_inch",
    "termcap_init2",
    "termcap_reset",
    "linefeed_if_not_lf",
    "backspace_if_not_bs",
    "other_non_function_keys",
    "arrow_key_map",
    "acs_ulcorner",
    "acs_llcorner",
    "acs_urcorner",
    "acs_lrcorner",
    "acs_ltee",
    "acs_rtee",
    "acs_btee",
    "acs_ttee",
    "acs_hline",
    "acs_vline",
    "acs_plus",
    "memory_lock",
    "memory_unlock",
    "box_chars_1"
  ];
  Tput.acsc = {
    "`": "\u25C6",
    a: "\u2592",
    b: "\t",
    c: "\f",
    d: "\r",
    e: `
`,
    f: "\xB0",
    g: "\xB1",
    h: "\u2424",
    i: "\v",
    j: "\u2518",
    k: "\u2510",
    l: "\u250C",
    m: "\u2514",
    n: "\u253C",
    o: "\u23BA",
    p: "\u23BB",
    q: "\u2500",
    r: "\u23BC",
    s: "\u23BD",
    t: "\u251C",
    u: "\u2524",
    v: "\u2534",
    w: "\u252C",
    x: "\u2502",
    y: "\u2264",
    z: "\u2265",
    "{": "\u03C0",
    "|": "\u2260",
    "}": "\xA3",
    "~": "\xB7"
  };
  Tput.utoa = Tput.prototype.utoa = {
    "\u25C6": "*",
    "\u2592": " ",
    "\xB0": "*",
    "\xB1": "+",
    "\u2424": `
`,
    "\u2518": "+",
    "\u2510": "+",
    "\u250C": "+",
    "\u2514": "+",
    "\u253C": "+",
    "\u23BA": "-",
    "\u23BB": "-",
    "\u2500": "-",
    "\u23BC": "-",
    "\u23BD": "_",
    "\u251C": "+",
    "\u2524": "+",
    "\u2534": "+",
    "\u252C": "+",
    "\u2502": "|",
    "\u2264": "<",
    "\u2265": ">",
    "\u03C0": "?",
    "\u2260": "=",
    "\xA3": "?",
    "\xB7": "*"
  };
  exports = Tput;
  exports.sprintf = sprintf;
  exports.tryRead = tryRead;
  module.exports = exports;
});

// node_modules/neo-blessed/lib/colors.js
var require_colors = __commonJS((exports) => {
  exports.match = function(r1, g1, b1) {
    if (typeof r1 === "string") {
      var hex = r1;
      if (hex[0] !== "#") {
        return -1;
      }
      hex = exports.hexToRGB(hex);
      r1 = hex[0], g1 = hex[1], b1 = hex[2];
    } else if (Array.isArray(r1)) {
      b1 = r1[2], g1 = r1[1], r1 = r1[0];
    }
    var hash = r1 << 16 | g1 << 8 | b1;
    if (exports._cache[hash] != null) {
      return exports._cache[hash];
    }
    var ldiff = Infinity, li = -1, i = 0, c, r2, g2, b2, diff;
    for (;i < exports.vcolors.length; i++) {
      c = exports.vcolors[i];
      r2 = c[0];
      g2 = c[1];
      b2 = c[2];
      diff = colorDistance(r1, g1, b1, r2, g2, b2);
      if (diff === 0) {
        li = i;
        break;
      }
      if (diff < ldiff) {
        ldiff = diff;
        li = i;
      }
    }
    return exports._cache[hash] = li;
  };
  exports.RGBToHex = function(r, g, b) {
    if (Array.isArray(r)) {
      b = r[2], g = r[1], r = r[0];
    }
    function hex(n) {
      n = n.toString(16);
      if (n.length < 2)
        n = "0" + n;
      return n;
    }
    return "#" + hex(r) + hex(g) + hex(b);
  };
  exports.hexToRGB = function(hex) {
    if (hex.length === 4) {
      hex = hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    var col = parseInt(hex.substring(1), 16), r = col >> 16 & 255, g = col >> 8 & 255, b = col & 255;
    return [r, g, b];
  };
  function colorDistance(r1, g1, b1, r2, g2, b2) {
    return Math.pow(30 * (r1 - r2), 2) + Math.pow(59 * (g1 - g2), 2) + Math.pow(11 * (b1 - b2), 2);
  }
  exports.mixColors = function(c1, c2, alpha) {
    if (c1 === 511)
      c1 = 0;
    if (c2 === 511)
      c2 = 0;
    if (alpha == null)
      alpha = 0.5;
    c1 = exports.vcolors[c1];
    var r1 = c1[0];
    var g1 = c1[1];
    var b1 = c1[2];
    c2 = exports.vcolors[c2];
    var r2 = c2[0];
    var g2 = c2[1];
    var b2 = c2[2];
    r1 += (r2 - r1) * alpha | 0;
    g1 += (g2 - g1) * alpha | 0;
    b1 += (b2 - b1) * alpha | 0;
    return exports.match([r1, g1, b1]);
  };
  exports.blend = function blend(attr, attr2, alpha) {
    var name, i, c, nc;
    var bg = attr & 511;
    if (attr2 != null) {
      var bg2 = attr2 & 511;
      if (bg === 511)
        bg = 0;
      if (bg2 === 511)
        bg2 = 0;
      bg = exports.mixColors(bg, bg2, alpha);
    } else {
      if (blend._cache[bg] != null) {
        bg = blend._cache[bg];
      } else if (bg >= 8 && bg <= 15) {
        bg -= 8;
      } else {
        name = exports.ncolors[bg];
        if (name) {
          for (i = 0;i < exports.ncolors.length; i++) {
            if (name === exports.ncolors[i] && i !== bg) {
              c = exports.vcolors[bg];
              nc = exports.vcolors[i];
              if (nc[0] + nc[1] + nc[2] < c[0] + c[1] + c[2]) {
                blend._cache[bg] = i;
                bg = i;
                break;
              }
            }
          }
        }
      }
    }
    attr &= ~511;
    attr |= bg;
    var fg = attr >> 9 & 511;
    if (attr2 != null) {
      var fg2 = attr2 >> 9 & 511;
      if (fg === 511) {
        fg = 248;
      } else {
        if (fg === 511)
          fg = 7;
        if (fg2 === 511)
          fg2 = 7;
        fg = exports.mixColors(fg, fg2, alpha);
      }
    } else {
      if (blend._cache[fg] != null) {
        fg = blend._cache[fg];
      } else if (fg >= 8 && fg <= 15) {
        fg -= 8;
      } else {
        name = exports.ncolors[fg];
        if (name) {
          for (i = 0;i < exports.ncolors.length; i++) {
            if (name === exports.ncolors[i] && i !== fg) {
              c = exports.vcolors[fg];
              nc = exports.vcolors[i];
              if (nc[0] + nc[1] + nc[2] < c[0] + c[1] + c[2]) {
                blend._cache[fg] = i;
                fg = i;
                break;
              }
            }
          }
        }
      }
    }
    attr &= ~(511 << 9);
    attr |= fg << 9;
    return attr;
  };
  exports.blend._cache = {};
  exports._cache = {};
  exports.reduce = function(color, total) {
    if (color >= 16 && total <= 16) {
      color = exports.ccolors[color];
    } else if (color >= 8 && total <= 8) {
      color -= 8;
    } else if (color >= 2 && total <= 2) {
      color %= 2;
    }
    return color;
  };
  exports.xterm = [
    "#000000",
    "#cd0000",
    "#00cd00",
    "#cdcd00",
    "#0000ee",
    "#cd00cd",
    "#00cdcd",
    "#e5e5e5",
    "#7f7f7f",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#5c5cff",
    "#ff00ff",
    "#00ffff",
    "#ffffff"
  ];
  exports.colors = function() {
    var cols = exports.colors = [], _cols = exports.vcolors = [], r, g, b, i, l;
    function hex(n) {
      n = n.toString(16);
      if (n.length < 2)
        n = "0" + n;
      return n;
    }
    function push(i2, r2, g2, b2) {
      cols[i2] = "#" + hex(r2) + hex(g2) + hex(b2);
      _cols[i2] = [r2, g2, b2];
    }
    exports.xterm.forEach(function(c, i2) {
      c = parseInt(c.substring(1), 16);
      push(i2, c >> 16 & 255, c >> 8 & 255, c & 255);
    });
    for (r = 0;r < 6; r++) {
      for (g = 0;g < 6; g++) {
        for (b = 0;b < 6; b++) {
          i = 16 + r * 36 + g * 6 + b;
          push(i, r ? r * 40 + 55 : 0, g ? g * 40 + 55 : 0, b ? b * 40 + 55 : 0);
        }
      }
    }
    for (g = 0;g < 24; g++) {
      l = g * 10 + 8;
      i = 232 + g;
      push(i, l, l, l);
    }
    return cols;
  }();
  exports.ccolors = function() {
    var _cols = exports.vcolors.slice(), cols = exports.colors.slice(), out;
    exports.vcolors = exports.vcolors.slice(0, 8);
    exports.colors = exports.colors.slice(0, 8);
    out = cols.map(exports.match);
    exports.colors = cols;
    exports.vcolors = _cols;
    exports.ccolors = out;
    return out;
  }();
  var colorNames = exports.colorNames = {
    default: -1,
    normal: -1,
    bg: -1,
    fg: -1,
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7,
    lightblack: 8,
    lightred: 9,
    lightgreen: 10,
    lightyellow: 11,
    lightblue: 12,
    lightmagenta: 13,
    lightcyan: 14,
    lightwhite: 15,
    brightblack: 8,
    brightred: 9,
    brightgreen: 10,
    brightyellow: 11,
    brightblue: 12,
    brightmagenta: 13,
    brightcyan: 14,
    brightwhite: 15,
    grey: 8,
    gray: 8,
    lightgrey: 7,
    lightgray: 7,
    brightgrey: 7,
    brightgray: 7
  };
  exports.convert = function(color) {
    if (typeof color === "number") {} else if (typeof color === "string") {
      color = color.replace(/[\- ]/g, "");
      if (colorNames[color] != null) {
        color = colorNames[color];
      } else {
        color = exports.match(color);
      }
    } else if (Array.isArray(color)) {
      color = exports.match(color);
    } else {
      color = -1;
    }
    return color !== -1 ? color : 511;
  };
  exports.ccolors = {
    blue: [
      4,
      12,
      [17, 21],
      [24, 27],
      [31, 33],
      [38, 39],
      45,
      [54, 57],
      [60, 63],
      [67, 69],
      [74, 75],
      81,
      [91, 93],
      [97, 99],
      [103, 105],
      [110, 111],
      117,
      [128, 129],
      [134, 135],
      [140, 141],
      [146, 147],
      153,
      165,
      171,
      177,
      183,
      189
    ],
    green: [
      2,
      10,
      22,
      [28, 29],
      [34, 36],
      [40, 43],
      [46, 50],
      [64, 65],
      [70, 72],
      [76, 79],
      [82, 86],
      [106, 108],
      [112, 115],
      [118, 122],
      [148, 151],
      [154, 158],
      [190, 194]
    ],
    cyan: [
      6,
      14,
      23,
      30,
      37,
      44,
      51,
      66,
      73,
      80,
      87,
      109,
      116,
      123,
      152,
      159,
      195
    ],
    red: [
      1,
      9,
      52,
      [88, 89],
      [94, 95],
      [124, 126],
      [130, 132],
      [136, 138],
      [160, 163],
      [166, 169],
      [172, 175],
      [178, 181],
      [196, 200],
      [202, 206],
      [208, 212],
      [214, 218],
      [220, 224]
    ],
    magenta: [
      5,
      13,
      53,
      90,
      96,
      127,
      133,
      139,
      164,
      170,
      176,
      182,
      201,
      207,
      213,
      219,
      225
    ],
    yellow: [
      3,
      11,
      58,
      [100, 101],
      [142, 144],
      [184, 187],
      [226, 230]
    ],
    black: [
      0,
      8,
      16,
      59,
      102,
      [232, 243]
    ],
    white: [
      7,
      15,
      145,
      188,
      231,
      [244, 255]
    ]
  };
  exports.ncolors = [];
  Object.keys(exports.ccolors).forEach(function(name) {
    exports.ccolors[name].forEach(function(offset) {
      if (typeof offset === "number") {
        exports.ncolors[offset] = name;
        exports.ccolors[offset] = exports.colorNames[name];
        return;
      }
      for (var i = offset[0], l = offset[1];i <= l; i++) {
        exports.ncolors[i] = name;
        exports.ccolors[i] = exports.colorNames[name];
      }
    });
    delete exports.ccolors[name];
  });
});

// node_modules/neo-blessed/lib/keys.js
var require_keys = __commonJS((exports) => {
  var EventEmitter = __require("events").EventEmitter;
  function listenerCount(stream, event) {
    return EventEmitter.listenerCount ? EventEmitter.listenerCount(stream, event) : stream.listeners(event).length;
  }
  function emitKeypressEvents(stream) {
    if (stream._keypressDecoder)
      return;
    var StringDecoder = __require("string_decoder").StringDecoder;
    stream._keypressDecoder = new StringDecoder("utf8");
    function onData(b) {
      if (listenerCount(stream, "keypress") > 0) {
        var r = stream._keypressDecoder.write(b);
        if (r)
          emitKeys(stream, r);
      } else {
        stream.removeListener("data", onData);
        stream.on("newListener", onNewListener);
      }
    }
    function onNewListener(event) {
      if (event === "keypress") {
        stream.on("data", onData);
        stream.removeListener("newListener", onNewListener);
      }
    }
    if (listenerCount(stream, "keypress") > 0) {
      stream.on("data", onData);
    } else {
      stream.on("newListener", onNewListener);
    }
  }
  exports.emitKeypressEvents = emitKeypressEvents;
  var metaKeyCodeReAnywhere = /(?:\x1b)([a-zA-Z0-9])/;
  var metaKeyCodeRe = new RegExp("^" + metaKeyCodeReAnywhere.source + "$");
  var functionKeyCodeReAnywhere = new RegExp("(?:\x1B+)(O|N|\\[|\\[\\[)(?:" + [
    "(\\d+)(?:;(\\d+))?([~^$])",
    "(?:M([@ #!a`])(.)(.))",
    "(?:1;)?(\\d+)?([a-zA-Z])"
  ].join("|") + ")");
  var functionKeyCodeRe = new RegExp("^" + functionKeyCodeReAnywhere.source);
  var escapeCodeReAnywhere = new RegExp([
    functionKeyCodeReAnywhere.source,
    metaKeyCodeReAnywhere.source,
    /\x1b./.source
  ].join("|"));
  function emitKeys(stream, s) {
    if (Buffer.isBuffer(s)) {
      if (s[0] > 127 && s[1] === undefined) {
        s[0] -= 128;
        s = "\x1B" + s.toString(stream.encoding || "utf-8");
      } else {
        s = s.toString(stream.encoding || "utf-8");
      }
    }
    if (isMouse(s))
      return;
    var buffer = [];
    var match;
    while (match = escapeCodeReAnywhere.exec(s)) {
      buffer = buffer.concat(s.slice(0, match.index).split(""));
      buffer.push(match[0]);
      s = s.slice(match.index + match[0].length);
    }
    buffer = buffer.concat(s.split(""));
    buffer.forEach(function(s2) {
      var ch, key = {
        sequence: s2,
        name: undefined,
        ctrl: false,
        meta: false,
        shift: false
      }, parts;
      if (s2 === "\r") {
        key.name = "return";
      } else if (s2 === `
`) {
        key.name = "enter";
      } else if (s2 === "\t") {
        key.name = "tab";
      } else if (s2 === "\b" || s2 === "\x7F" || s2 === "\x1B\x7F" || s2 === "\x1B\b") {
        key.name = "backspace";
        key.meta = s2.charAt(0) === "\x1B";
      } else if (s2 === "\x1B" || s2 === "\x1B\x1B") {
        key.name = "escape";
        key.meta = s2.length === 2;
      } else if (s2 === " " || s2 === "\x1B ") {
        key.name = "space";
        key.meta = s2.length === 2;
      } else if (s2.length === 1 && s2 <= "\x1A") {
        key.name = String.fromCharCode(s2.charCodeAt(0) + 97 - 1);
        key.ctrl = true;
      } else if (s2.length === 1 && s2 >= "a" && s2 <= "z") {
        key.name = s2;
      } else if (s2.length === 1 && s2 >= "A" && s2 <= "Z") {
        key.name = s2.toLowerCase();
        key.shift = true;
      } else if (parts = metaKeyCodeRe.exec(s2)) {
        key.name = parts[1].toLowerCase();
        key.meta = true;
        key.shift = /^[A-Z]$/.test(parts[1]);
      } else if (parts = functionKeyCodeRe.exec(s2)) {
        var code = (parts[1] || "") + (parts[2] || "") + (parts[4] || "") + (parts[9] || ""), modifier = (parts[3] || parts[8] || 1) - 1;
        key.ctrl = !!(modifier & 4);
        key.meta = !!(modifier & 10);
        key.shift = !!(modifier & 1);
        key.code = code;
        switch (code) {
          case "OP":
            key.name = "f1";
            break;
          case "OQ":
            key.name = "f2";
            break;
          case "OR":
            key.name = "f3";
            break;
          case "OS":
            key.name = "f4";
            break;
          case "[11~":
            key.name = "f1";
            break;
          case "[12~":
            key.name = "f2";
            break;
          case "[13~":
            key.name = "f3";
            break;
          case "[14~":
            key.name = "f4";
            break;
          case "[[A":
            key.name = "f1";
            break;
          case "[[B":
            key.name = "f2";
            break;
          case "[[C":
            key.name = "f3";
            break;
          case "[[D":
            key.name = "f4";
            break;
          case "[[E":
            key.name = "f5";
            break;
          case "[15~":
            key.name = "f5";
            break;
          case "[17~":
            key.name = "f6";
            break;
          case "[18~":
            key.name = "f7";
            break;
          case "[19~":
            key.name = "f8";
            break;
          case "[20~":
            key.name = "f9";
            break;
          case "[21~":
            key.name = "f10";
            break;
          case "[23~":
            key.name = "f11";
            break;
          case "[24~":
            key.name = "f12";
            break;
          case "[A":
            key.name = "up";
            break;
          case "[B":
            key.name = "down";
            break;
          case "[C":
            key.name = "right";
            break;
          case "[D":
            key.name = "left";
            break;
          case "[E":
            key.name = "clear";
            break;
          case "[F":
            key.name = "end";
            break;
          case "[H":
            key.name = "home";
            break;
          case "OA":
            key.name = "up";
            break;
          case "OB":
            key.name = "down";
            break;
          case "OC":
            key.name = "right";
            break;
          case "OD":
            key.name = "left";
            break;
          case "OE":
            key.name = "clear";
            break;
          case "OF":
            key.name = "end";
            break;
          case "OH":
            key.name = "home";
            break;
          case "[1~":
            key.name = "home";
            break;
          case "[2~":
            key.name = "insert";
            break;
          case "[3~":
            key.name = "delete";
            break;
          case "[4~":
            key.name = "end";
            break;
          case "[5~":
            key.name = "pageup";
            break;
          case "[6~":
            key.name = "pagedown";
            break;
          case "[[5~":
            key.name = "pageup";
            break;
          case "[[6~":
            key.name = "pagedown";
            break;
          case "[7~":
            key.name = "home";
            break;
          case "[8~":
            key.name = "end";
            break;
          case "[a":
            key.name = "up";
            key.shift = true;
            break;
          case "[b":
            key.name = "down";
            key.shift = true;
            break;
          case "[c":
            key.name = "right";
            key.shift = true;
            break;
          case "[d":
            key.name = "left";
            key.shift = true;
            break;
          case "[e":
            key.name = "clear";
            key.shift = true;
            break;
          case "[2$":
            key.name = "insert";
            key.shift = true;
            break;
          case "[3$":
            key.name = "delete";
            key.shift = true;
            break;
          case "[5$":
            key.name = "pageup";
            key.shift = true;
            break;
          case "[6$":
            key.name = "pagedown";
            key.shift = true;
            break;
          case "[7$":
            key.name = "home";
            key.shift = true;
            break;
          case "[8$":
            key.name = "end";
            key.shift = true;
            break;
          case "Oa":
            key.name = "up";
            key.ctrl = true;
            break;
          case "Ob":
            key.name = "down";
            key.ctrl = true;
            break;
          case "Oc":
            key.name = "right";
            key.ctrl = true;
            break;
          case "Od":
            key.name = "left";
            key.ctrl = true;
            break;
          case "Oe":
            key.name = "clear";
            key.ctrl = true;
            break;
          case "[2^":
            key.name = "insert";
            key.ctrl = true;
            break;
          case "[3^":
            key.name = "delete";
            key.ctrl = true;
            break;
          case "[5^":
            key.name = "pageup";
            key.ctrl = true;
            break;
          case "[6^":
            key.name = "pagedown";
            key.ctrl = true;
            break;
          case "[7^":
            key.name = "home";
            key.ctrl = true;
            break;
          case "[8^":
            key.name = "end";
            key.ctrl = true;
            break;
          case "[Z":
            key.name = "tab";
            key.shift = true;
            break;
          default:
            key.name = "undefined";
            break;
        }
      }
      if (key.name === undefined) {
        key = undefined;
      }
      if (s2.length === 1) {
        ch = s2;
      }
      if (key || ch) {
        stream.emit("keypress", ch, key);
      }
    });
  }
  function isMouse(s) {
    return /\x1b\[M/.test(s) || /\x1b\[M([\x00\u0020-\uffff]{3})/.test(s) || /\x1b\[(\d+;\d+;\d+)M/.test(s) || /\x1b\[<(\d+;\d+;\d+)([mM])/.test(s) || /\x1b\[<(\d+;\d+;\d+;\d+)&w/.test(s) || /\x1b\[24([0135])~\[(\d+),(\d+)\]\r/.test(s) || /\x1b\[(O|I)/.test(s);
  }
});

// node_modules/neo-blessed/lib/gpmclient.js
var require_gpmclient = __commonJS((exports, module) => {
  var net = __require("net");
  var fs = __require("fs");
  var EventEmitter = __require("events").EventEmitter;
  var GPM_USE_MAGIC = false;
  var GPM_MOVE = 1;
  var GPM_DRAG = 2;
  var GPM_DOWN = 4;
  var GPM_UP = 8;
  var GPM_DOUBLE = 32;
  var GPM_MFLAG = 128;
  var GPM_REQ_NOPASTE = 3;
  var GPM_HARD = 256;
  var GPM_MAGIC = 1198550348;
  var GPM_SOCKET = "/dev/gpmctl";
  function send_config(socket, Gpm_Connect, callback) {
    var buffer;
    if (GPM_USE_MAGIC) {
      buffer = new Buffer(20);
      buffer.writeUInt32LE(GPM_MAGIC, 0);
      buffer.writeUInt16LE(Gpm_Connect.eventMask, 4);
      buffer.writeUInt16LE(Gpm_Connect.defaultMask, 6);
      buffer.writeUInt16LE(Gpm_Connect.minMod, 8);
      buffer.writeUInt16LE(Gpm_Connect.maxMod, 10);
      buffer.writeInt16LE(process.pid, 12);
      buffer.writeInt16LE(Gpm_Connect.vc, 16);
    } else {
      buffer = new Buffer(16);
      buffer.writeUInt16LE(Gpm_Connect.eventMask, 0);
      buffer.writeUInt16LE(Gpm_Connect.defaultMask, 2);
      buffer.writeUInt16LE(Gpm_Connect.minMod, 4);
      buffer.writeUInt16LE(Gpm_Connect.maxMod, 6);
      buffer.writeInt16LE(Gpm_Connect.pid, 8);
      buffer.writeInt16LE(Gpm_Connect.vc, 12);
    }
    socket.write(buffer, function() {
      if (callback)
        callback();
    });
  }
  function parseEvent(raw) {
    var evnt = {};
    evnt.buttons = raw[0];
    evnt.modifiers = raw[1];
    evnt.vc = raw.readUInt16LE(2);
    evnt.dx = raw.readInt16LE(4);
    evnt.dy = raw.readInt16LE(6);
    evnt.x = raw.readInt16LE(8);
    evnt.y = raw.readInt16LE(10);
    evnt.type = raw.readInt16LE(12);
    evnt.clicks = raw.readInt32LE(16);
    evnt.margin = raw.readInt32LE(20);
    evnt.wdx = raw.readInt16LE(24);
    evnt.wdy = raw.readInt16LE(26);
    return evnt;
  }
  function GpmClient(options) {
    if (!(this instanceof GpmClient)) {
      return new GpmClient(options);
    }
    EventEmitter.call(this);
    var pid = process.pid;
    var path;
    try {
      path = fs.readlinkSync("/proc/" + pid + "/fd/0");
    } catch (e) {}
    var tty = /tty[0-9]+$/.exec(path);
    if (tty === null) {}
    var vc;
    if (tty) {
      tty = tty[0];
      vc = +/[0-9]+$/.exec(tty)[0];
    }
    var self = this;
    if (tty) {
      fs.stat(GPM_SOCKET, function(err, stat) {
        if (err || !stat.isSocket()) {
          return;
        }
        var conf = {
          eventMask: 65535,
          defaultMask: GPM_MOVE | GPM_HARD,
          minMod: 0,
          maxMod: 65535,
          pid,
          vc
        };
        var gpm = net.createConnection(GPM_SOCKET);
        this.gpm = gpm;
        gpm.on("connect", function() {
          send_config(gpm, conf, function() {
            conf.pid = 0;
            conf.vc = GPM_REQ_NOPASTE;
          });
        });
        gpm.on("data", function(packet) {
          var evnt = parseEvent(packet);
          switch (evnt.type & 15) {
            case GPM_MOVE:
              if (evnt.dx || evnt.dy) {
                self.emit("move", evnt.buttons, evnt.modifiers, evnt.x, evnt.y);
              }
              if (evnt.wdx || evnt.wdy) {
                self.emit("mousewheel", evnt.buttons, evnt.modifiers, evnt.x, evnt.y, evnt.wdx, evnt.wdy);
              }
              break;
            case GPM_DRAG:
              if (evnt.dx || evnt.dy) {
                self.emit("drag", evnt.buttons, evnt.modifiers, evnt.x, evnt.y);
              }
              if (evnt.wdx || evnt.wdy) {
                self.emit("mousewheel", evnt.buttons, evnt.modifiers, evnt.x, evnt.y, evnt.wdx, evnt.wdy);
              }
              break;
            case GPM_DOWN:
              self.emit("btndown", evnt.buttons, evnt.modifiers, evnt.x, evnt.y);
              if (evnt.type & GPM_DOUBLE) {
                self.emit("dblclick", evnt.buttons, evnt.modifiers, evnt.x, evnt.y);
              }
              break;
            case GPM_UP:
              self.emit("btnup", evnt.buttons, evnt.modifiers, evnt.x, evnt.y);
              if (!(evnt.type & GPM_MFLAG)) {
                self.emit("click", evnt.buttons, evnt.modifiers, evnt.x, evnt.y);
              }
              break;
          }
        });
        gpm.on("error", function() {
          self.stop();
        });
      });
    }
  }
  GpmClient.prototype.__proto__ = EventEmitter.prototype;
  GpmClient.prototype.stop = function() {
    if (this.gpm) {
      this.gpm.end();
    }
    delete this.gpm;
  };
  GpmClient.prototype.ButtonName = function(btn) {
    if (btn & 4)
      return "left";
    if (btn & 2)
      return "middle";
    if (btn & 1)
      return "right";
    return "";
  };
  GpmClient.prototype.hasShiftKey = function(mod) {
    return mod & 1 ? true : false;
  };
  GpmClient.prototype.hasCtrlKey = function(mod) {
    return mod & 4 ? true : false;
  };
  GpmClient.prototype.hasMetaKey = function(mod) {
    return mod & 8 ? true : false;
  };
  module.exports = GpmClient;
});

// node_modules/neo-blessed/lib/program.js
var require_program = __commonJS((exports, module) => {
  var EventEmitter = __require("events").EventEmitter;
  var StringDecoder = __require("string_decoder").StringDecoder;
  var cp = __require("child_process");
  var util = __require("util");
  var fs = __require("fs");
  var Tput = require_tput();
  var colors = require_colors();
  var slice = Array.prototype.slice;
  var nextTick = global.setImmediate || process.nextTick.bind(process);
  function Program(options) {
    var self = this;
    if (!(this instanceof Program)) {
      return new Program(options);
    }
    Program.bind(this);
    EventEmitter.call(this);
    if (!options || options.__proto__ !== Object.prototype) {
      options = {
        input: arguments[0],
        output: arguments[1]
      };
    }
    this.options = options;
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    options.log = options.log || options.dump;
    if (options.log) {
      this._logger = fs.createWriteStream(options.log);
      if (options.dump)
        this.setupDump();
    }
    this.zero = options.zero !== false;
    this.useBuffer = options.buffer;
    this.x = 0;
    this.y = 0;
    this.savedX = 0;
    this.savedY = 0;
    this.cols = this.output.columns || 1;
    this.rows = this.output.rows || 1;
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
    this._terminal = options.terminal || options.term || process.env.TERM || (process.platform === "win32" ? "windows-ansi" : "xterm");
    this._terminal = this._terminal.toLowerCase();
    this.isOSXTerm = process.env.TERM_PROGRAM === "Apple_Terminal";
    this.isiTerm2 = process.env.TERM_PROGRAM === "iTerm.app" || !!process.env.ITERM_SESSION_ID;
    this.isXFCE = /xfce/i.test(process.env.COLORTERM);
    this.isTerminator = !!process.env.TERMINATOR_UUID;
    this.isLXDE = false;
    this.isVTE = !!process.env.VTE_VERSION || this.isXFCE || this.isTerminator || this.isLXDE;
    this.isRxvt = /rxvt/i.test(process.env.COLORTERM);
    this.isXterm = false;
    this.tmux = !!process.env.TMUX;
    this.tmuxVersion = function() {
      if (!self.tmux)
        return 2;
      try {
        var version = cp.execFileSync("tmux", ["-V"], { encoding: "utf8" });
        return +/^tmux ([\d.]+)/i.exec(version.trim().split(`
`)[0])[1];
      } catch (e) {
        return 2;
      }
    }();
    this._buf = "";
    this._flush = this.flush.bind(this);
    if (options.tput !== false) {
      this.setupTput();
    }
    this.listen();
  }
  Program.global = null;
  Program.total = 0;
  Program.instances = [];
  Program.bind = function(program) {
    if (!Program.global) {
      Program.global = program;
    }
    if (!~Program.instances.indexOf(program)) {
      Program.instances.push(program);
      program.index = Program.total;
      Program.total++;
    }
    if (Program._bound)
      return;
    Program._bound = true;
    unshiftEvent(process, "exit", Program._exitHandler = function() {
      Program.instances.forEach(function(program2) {
        program2.flush();
        program2._exiting = true;
      });
    });
  };
  Program.prototype.__proto__ = EventEmitter.prototype;
  Program.prototype.type = "program";
  Program.prototype.log = function() {
    return this._log("LOG", util.format.apply(util, arguments));
  };
  Program.prototype.debug = function() {
    if (!this.options.debug)
      return;
    return this._log("DEBUG", util.format.apply(util, arguments));
  };
  Program.prototype._log = function(pre, msg) {
    if (!this._logger)
      return;
    return this._logger.write(pre + ": " + msg + `
-
`);
  };
  Program.prototype.setupDump = function() {
    var self = this, write = this.output.write, decoder = new StringDecoder("utf8");
    function stringify(data) {
      return caret(data.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t")).replace(/[^ -~]/g, function(ch) {
        if (ch.charCodeAt(0) > 255)
          return ch;
        ch = ch.charCodeAt(0).toString(16);
        if (ch.length > 2) {
          if (ch.length < 4)
            ch = "0" + ch;
          return "\\u" + ch;
        }
        if (ch.length < 2)
          ch = "0" + ch;
        return "\\x" + ch;
      });
    }
    function caret(data) {
      return data.replace(/[\0\x80\x1b-\x1f\x7f\x01-\x1a]/g, function(ch) {
        switch (ch) {
          case "\x00":
          case "\x80":
            ch = "@";
            break;
          case "\x1B":
            ch = "[";
            break;
          case "\x1C":
            ch = "\\";
            break;
          case "\x1D":
            ch = "]";
            break;
          case "\x1E":
            ch = "^";
            break;
          case "\x1F":
            ch = "_";
            break;
          case "\x7F":
            ch = "?";
            break;
          default:
            ch = ch.charCodeAt(0);
            if (ch >= 1 && ch <= 26) {
              ch = String.fromCharCode(ch + 64);
            } else {
              return String.fromCharCode(ch);
            }
            break;
        }
        return "^" + ch;
      });
    }
    this.input.on("data", function(data) {
      self._log("IN", stringify(decoder.write(data)));
    });
    this.output.write = function(data) {
      self._log("OUT", stringify(data));
      return write.apply(this, arguments);
    };
  };
  Program.prototype.setupTput = function() {
    if (this._tputSetup)
      return;
    this._tputSetup = true;
    var self = this, options = this.options, write = this._write.bind(this);
    var tput = this.tput = new Tput({
      terminal: this.terminal,
      padding: options.padding,
      extended: options.extended,
      printf: options.printf,
      termcap: options.termcap,
      forceUnicode: options.forceUnicode
    });
    if (tput.error) {
      nextTick(function() {
        self.emit("warning", tput.error.message);
      });
    }
    if (tput.padding) {
      nextTick(function() {
        self.emit("warning", "Terminfo padding has been enabled.");
      });
    }
    this.put = function() {
      var args = slice.call(arguments), cap = args.shift();
      if (tput[cap]) {
        return this._write(tput[cap].apply(tput, args));
      }
    };
    Object.keys(tput).forEach(function(key) {
      if (self[key] == null) {
        self[key] = tput[key];
      }
      if (typeof tput[key] !== "function") {
        self.put[key] = tput[key];
        return;
      }
      if (tput.padding) {
        self.put[key] = function() {
          return tput._print(tput[key].apply(tput, arguments), write);
        };
      } else {
        self.put[key] = function() {
          return self._write(tput[key].apply(tput, arguments));
        };
      }
    });
  };
  Program.prototype.__defineGetter__("terminal", function() {
    return this._terminal;
  });
  Program.prototype.__defineSetter__("terminal", function(terminal) {
    this.setTerminal(terminal);
    return this.terminal;
  });
  Program.prototype.setTerminal = function(terminal) {
    this._terminal = terminal.toLowerCase();
    delete this._tputSetup;
    this.setupTput();
  };
  Program.prototype.has = function(name) {
    return this.tput ? this.tput.has(name) : false;
  };
  Program.prototype.term = function(is) {
    return this.terminal.indexOf(is) === 0;
  };
  Program.prototype.listen = function() {
    var self = this;
    if (!this.input._blessedInput) {
      this.input._blessedInput = 1;
      this._listenInput();
    } else {
      this.input._blessedInput++;
    }
    this.on("newListener", this._newHandler = function fn(type) {
      if (type === "keypress" || type === "mouse") {
        self.removeListener("newListener", fn);
        if (self.input.setRawMode && !self.input.isRaw) {
          self.input.setRawMode(true);
          self.input.resume();
        }
      }
    });
    this.on("newListener", function fn(type) {
      if (type === "mouse") {
        self.removeListener("newListener", fn);
        self.bindMouse();
      }
    });
    if (!this.output._blessedOutput) {
      this.output._blessedOutput = 1;
      this._listenOutput();
    } else {
      this.output._blessedOutput++;
    }
  };
  Program.prototype._listenInput = function() {
    var keys = require_keys(), self = this;
    this.input.on("keypress", this.input._keypressHandler = function(ch, key) {
      key = key || { ch };
      if (key.name === "undefined" && (key.code === "[M" || key.code === "[I" || key.code === "[O")) {
        return;
      }
      if (key.name === "undefined") {
        return;
      }
      if (key.name === "enter" && key.sequence === `
`) {
        key.name = "linefeed";
      }
      if (key.name === "return" && key.sequence === "\r") {
        self.input.emit("keypress", ch, merge({}, key, { name: "enter" }));
      }
      var name = (key.ctrl ? "C-" : "") + (key.meta ? "M-" : "") + (key.shift && key.name ? "S-" : "") + (key.name || ch);
      key.full = name;
      Program.instances.forEach(function(program) {
        if (program.input !== self.input)
          return;
        program.emit("keypress", ch, key);
        program.emit("key " + name, ch, key);
      });
    });
    this.input.on("data", this.input._dataHandler = function(data) {
      Program.instances.forEach(function(program) {
        if (program.input !== self.input)
          return;
        program.emit("data", data);
      });
    });
    keys.emitKeypressEvents(this.input);
  };
  Program.prototype._listenOutput = function() {
    var self = this;
    if (!this.output.isTTY) {
      nextTick(function() {
        self.emit("warning", "Output is not a TTY");
      });
    }
    function resize() {
      Program.instances.forEach(function(program) {
        if (program.output !== self.output)
          return;
        program.cols = program.output.columns;
        program.rows = program.output.rows;
        program.emit("resize");
      });
    }
    this.output.on("resize", this.output._resizeHandler = function() {
      Program.instances.forEach(function(program) {
        if (program.output !== self.output)
          return;
        if (!program.options.resizeTimeout) {
          return resize();
        }
        if (program._resizeTimer) {
          clearTimeout(program._resizeTimer);
          delete program._resizeTimer;
        }
        var time = typeof program.options.resizeTimeout === "number" ? program.options.resizeTimeout : 300;
        program._resizeTimer = setTimeout(resize, time);
      });
    });
  };
  Program.prototype.destroy = function() {
    var index = Program.instances.indexOf(this);
    if (~index) {
      Program.instances.splice(index, 1);
      Program.total--;
      this.flush();
      this._exiting = true;
      Program.global = Program.instances[0];
      if (Program.total === 0) {
        Program.global = null;
        process.removeListener("exit", Program._exitHandler);
        delete Program._exitHandler;
        delete Program._bound;
      }
      this.input._blessedInput--;
      this.output._blessedOutput--;
      if (this.input._blessedInput === 0) {
        this.input.removeListener("keypress", this.input._keypressHandler);
        this.input.removeListener("data", this.input._dataHandler);
        delete this.input._keypressHandler;
        delete this.input._dataHandler;
        if (this.input.setRawMode) {
          if (this.input.isRaw) {
            this.input.setRawMode(false);
          }
          if (!this.input.destroyed) {
            this.input.pause();
          }
        }
      }
      if (this.output._blessedOutput === 0) {
        this.output.removeListener("resize", this.output._resizeHandler);
        delete this.output._resizeHandler;
      }
      this.removeListener("newListener", this._newHandler);
      delete this._newHandler;
      this.destroyed = true;
      this.emit("destroy");
    }
  };
  Program.prototype.key = function(key, listener) {
    if (typeof key === "string")
      key = key.split(/\s*,\s*/);
    key.forEach(function(key2) {
      return this.on("key " + key2, listener);
    }, this);
  };
  Program.prototype.onceKey = function(key, listener) {
    if (typeof key === "string")
      key = key.split(/\s*,\s*/);
    key.forEach(function(key2) {
      return this.once("key " + key2, listener);
    }, this);
  };
  Program.prototype.unkey = Program.prototype.removeKey = function(key, listener) {
    if (typeof key === "string")
      key = key.split(/\s*,\s*/);
    key.forEach(function(key2) {
      return this.removeListener("key " + key2, listener);
    }, this);
  };
  Program.prototype.bindMouse = function() {
    if (this._boundMouse)
      return;
    this._boundMouse = true;
    var decoder = new StringDecoder("utf8"), self = this;
    this.on("data", function(data) {
      var text = decoder.write(data);
      if (!text)
        return;
      self._bindMouse(text, data);
    });
  };
  Program.prototype._bindMouse = function(s, buf) {
    var self = this, key, parts, b, x, y, mod, params, down, page, button;
    key = {
      name: undefined,
      ctrl: false,
      meta: false,
      shift: false
    };
    if (Buffer.isBuffer(s)) {
      if (s[0] > 127 && s[1] === undefined) {
        s[0] -= 128;
        s = "\x1B" + s.toString("utf-8");
      } else {
        s = s.toString("utf-8");
      }
    }
    var bx = s.charCodeAt(4);
    var by = s.charCodeAt(5);
    if (buf[0] === 27 && buf[1] === 91 && buf[2] === 77 && (this.isVTE || bx >= 65533 || by >= 65533 || bx > 0 && bx < 32 || by > 0 && by < 32 || buf[4] > 223 && buf[4] < 248 && buf.length === 6 || buf[5] > 223 && buf[5] < 248 && buf.length === 6)) {
      b = buf[3];
      x = buf[4];
      y = buf[5];
      if (x < 32)
        x += 255;
      if (y < 32)
        y += 255;
      s = "\x1B[M" + String.fromCharCode(b) + String.fromCharCode(x) + String.fromCharCode(y);
    }
    if (parts = /^\x1b\[M([\x00\u0020-\uffff]{3})/.exec(s)) {
      b = parts[1].charCodeAt(0);
      x = parts[1].charCodeAt(1);
      y = parts[1].charCodeAt(2);
      key.name = "mouse";
      key.type = "X10";
      key.raw = [b, x, y, parts[0]];
      key.buf = buf;
      key.x = x - 32;
      key.y = y - 32;
      if (this.zero)
        key.x--, key.y--;
      if (x === 0)
        key.x = 255;
      if (y === 0)
        key.y = 255;
      mod = b >> 2;
      key.shift = !!(mod & 1);
      key.meta = !!(mod >> 1 & 1);
      key.ctrl = !!(mod >> 2 & 1);
      b -= 32;
      if (b >> 6 & 1) {
        key.action = b & 1 ? "wheeldown" : "wheelup";
        key.button = "middle";
      } else if (b === 3) {
        key.action = "mouseup";
        key.button = this._lastButton || "unknown";
        delete this._lastButton;
      } else {
        key.action = "mousedown";
        button = b & 3;
        key.button = button === 0 ? "left" : button === 1 ? "middle" : button === 2 ? "right" : "unknown";
        this._lastButton = key.button;
      }
      if (b === 35 || b === 39 || b === 51 || b === 43 || this.isVTE && (b === 32 || b === 36 || b === 48 || b === 40)) {
        delete key.button;
        key.action = "mousemove";
      }
      self.emit("mouse", key);
      return;
    }
    if (parts = /^\x1b\[(\d+;\d+;\d+)M/.exec(s)) {
      params = parts[1].split(";");
      b = +params[0];
      x = +params[1];
      y = +params[2];
      key.name = "mouse";
      key.type = "urxvt";
      key.raw = [b, x, y, parts[0]];
      key.buf = buf;
      key.x = x;
      key.y = y;
      if (this.zero)
        key.x--, key.y--;
      mod = b >> 2;
      key.shift = !!(mod & 1);
      key.meta = !!(mod >> 1 & 1);
      key.ctrl = !!(mod >> 2 & 1);
      if (b === 128 || b === 129) {
        b = 67;
      }
      b -= 32;
      if (b >> 6 & 1) {
        key.action = b & 1 ? "wheeldown" : "wheelup";
        key.button = "middle";
      } else if (b === 3) {
        key.action = "mouseup";
        key.button = this._lastButton || "unknown";
        delete this._lastButton;
      } else {
        key.action = "mousedown";
        button = b & 3;
        key.button = button === 0 ? "left" : button === 1 ? "middle" : button === 2 ? "right" : "unknown";
        this._lastButton = key.button;
      }
      if (b === 35 || b === 39 || b === 51 || b === 43 || this.isVTE && (b === 32 || b === 36 || b === 48 || b === 40)) {
        delete key.button;
        key.action = "mousemove";
      }
      self.emit("mouse", key);
      return;
    }
    if (parts = /^\x1b\[<(\d+;\d+;\d+)([mM])/.exec(s)) {
      down = parts[2] === "M";
      params = parts[1].split(";");
      b = +params[0];
      x = +params[1];
      y = +params[2];
      key.name = "mouse";
      key.type = "sgr";
      key.raw = [b, x, y, parts[0]];
      key.buf = buf;
      key.x = x;
      key.y = y;
      if (this.zero)
        key.x--, key.y--;
      mod = b >> 2;
      key.shift = !!(mod & 1);
      key.meta = !!(mod >> 1 & 1);
      key.ctrl = !!(mod >> 2 & 1);
      if (b >> 6 & 1) {
        key.action = b & 1 ? "wheeldown" : "wheelup";
        key.button = "middle";
      } else {
        key.action = down ? "mousedown" : "mouseup";
        button = b & 3;
        key.button = button === 0 ? "left" : button === 1 ? "middle" : button === 2 ? "right" : "unknown";
      }
      if (b === 35 || b === 39 || b === 51 || b === 43 || this.isVTE && (b === 32 || b === 36 || b === 48 || b === 40)) {
        delete key.button;
        key.action = "mousemove";
      }
      self.emit("mouse", key);
      return;
    }
    if (parts = /^\x1b\[<(\d+;\d+;\d+;\d+)&w/.exec(s)) {
      params = parts[1].split(";");
      b = +params[0];
      x = +params[1];
      y = +params[2];
      page = +params[3];
      key.name = "mouse";
      key.type = "dec";
      key.raw = [b, x, y, parts[0]];
      key.buf = buf;
      key.x = x;
      key.y = y;
      key.page = page;
      if (this.zero)
        key.x--, key.y--;
      key.action = b === 3 ? "mouseup" : "mousedown";
      key.button = b === 2 ? "left" : b === 4 ? "middle" : b === 6 ? "right" : "unknown";
      self.emit("mouse", key);
      return;
    }
    if (parts = /^\x1b\[24([0135])~\[(\d+),(\d+)\]\r/.exec(s)) {
      b = +parts[1];
      x = +parts[2];
      y = +parts[3];
      key.name = "mouse";
      key.type = "vt300";
      key.raw = [b, x, y, parts[0]];
      key.buf = buf;
      key.x = x;
      key.y = y;
      if (this.zero)
        key.x--, key.y--;
      key.action = "mousedown";
      key.button = b === 1 ? "left" : b === 2 ? "middle" : b === 5 ? "right" : "unknown";
      self.emit("mouse", key);
      return;
    }
    if (parts = /^\x1b\[(O|I)/.exec(s)) {
      key.action = parts[1] === "I" ? "focus" : "blur";
      self.emit("mouse", key);
      self.emit(key.action);
      return;
    }
  };
  Program.prototype.enableGpm = function() {
    var self = this;
    var gpmclient = require_gpmclient();
    if (this.gpm)
      return;
    this.gpm = gpmclient();
    this.gpm.on("btndown", function(btn, modifier, x, y) {
      x--, y--;
      var key = {
        name: "mouse",
        type: "GPM",
        action: "mousedown",
        button: self.gpm.ButtonName(btn),
        raw: [btn, modifier, x, y],
        x,
        y,
        shift: self.gpm.hasShiftKey(modifier),
        meta: self.gpm.hasMetaKey(modifier),
        ctrl: self.gpm.hasCtrlKey(modifier)
      };
      self.emit("mouse", key);
    });
    this.gpm.on("btnup", function(btn, modifier, x, y) {
      x--, y--;
      var key = {
        name: "mouse",
        type: "GPM",
        action: "mouseup",
        button: self.gpm.ButtonName(btn),
        raw: [btn, modifier, x, y],
        x,
        y,
        shift: self.gpm.hasShiftKey(modifier),
        meta: self.gpm.hasMetaKey(modifier),
        ctrl: self.gpm.hasCtrlKey(modifier)
      };
      self.emit("mouse", key);
    });
    this.gpm.on("move", function(btn, modifier, x, y) {
      x--, y--;
      var key = {
        name: "mouse",
        type: "GPM",
        action: "mousemove",
        button: self.gpm.ButtonName(btn),
        raw: [btn, modifier, x, y],
        x,
        y,
        shift: self.gpm.hasShiftKey(modifier),
        meta: self.gpm.hasMetaKey(modifier),
        ctrl: self.gpm.hasCtrlKey(modifier)
      };
      self.emit("mouse", key);
    });
    this.gpm.on("drag", function(btn, modifier, x, y) {
      x--, y--;
      var key = {
        name: "mouse",
        type: "GPM",
        action: "mousemove",
        button: self.gpm.ButtonName(btn),
        raw: [btn, modifier, x, y],
        x,
        y,
        shift: self.gpm.hasShiftKey(modifier),
        meta: self.gpm.hasMetaKey(modifier),
        ctrl: self.gpm.hasCtrlKey(modifier)
      };
      self.emit("mouse", key);
    });
    this.gpm.on("mousewheel", function(btn, modifier, x, y, dx, dy) {
      var key = {
        name: "mouse",
        type: "GPM",
        action: dy > 0 ? "wheelup" : "wheeldown",
        button: self.gpm.ButtonName(btn),
        raw: [btn, modifier, x, y, dx, dy],
        x,
        y,
        shift: self.gpm.hasShiftKey(modifier),
        meta: self.gpm.hasMetaKey(modifier),
        ctrl: self.gpm.hasCtrlKey(modifier)
      };
      self.emit("mouse", key);
    });
  };
  Program.prototype.disableGpm = function() {
    if (this.gpm) {
      this.gpm.stop();
      delete this.gpm;
    }
  };
  Program.prototype.bindResponse = function() {
    if (this._boundResponse)
      return;
    this._boundResponse = true;
    var decoder = new StringDecoder("utf8"), self = this;
    this.on("data", function(data) {
      data = decoder.write(data);
      if (!data)
        return;
      self._bindResponse(data);
    });
  };
  Program.prototype._bindResponse = function(s) {
    var out = {}, parts;
    if (Buffer.isBuffer(s)) {
      if (s[0] > 127 && s[1] === undefined) {
        s[0] -= 128;
        s = "\x1B" + s.toString("utf-8");
      } else {
        s = s.toString("utf-8");
      }
    }
    if (parts = /^\x1b\[(\?|>)(\d*(?:;\d*)*)c/.exec(s)) {
      parts = parts[2].split(";").map(function(ch) {
        return +ch || 0;
      });
      out.event = "device-attributes";
      out.code = "DA";
      if (parts[1] === "?") {
        out.type = "primary-attribute";
        if (parts[0] === 1 && parts[2] === 2) {
          out.term = "vt100";
          out.advancedVideo = true;
        } else if (parts[0] === 1 && parts[2] === 0) {
          out.term = "vt101";
        } else if (parts[0] === 6) {
          out.term = "vt102";
        } else if (parts[0] === 60 && parts[1] === 1 && parts[2] === 2 && parts[3] === 6 && parts[4] === 8 && parts[5] === 9 && parts[6] === 15) {
          out.term = "vt220";
        } else {
          parts.forEach(function(attr) {
            switch (attr) {
              case 1:
                out.cols132 = true;
                break;
              case 2:
                out.printer = true;
                break;
              case 6:
                out.selectiveErase = true;
                break;
              case 8:
                out.userDefinedKeys = true;
                break;
              case 9:
                out.nationalReplacementCharsets = true;
                break;
              case 15:
                out.technicalCharacters = true;
                break;
              case 18:
                out.userWindows = true;
                break;
              case 21:
                out.horizontalScrolling = true;
                break;
              case 22:
                out.ansiColor = true;
                break;
              case 29:
                out.ansiTextLocator = true;
                break;
            }
          });
        }
      } else {
        out.type = "secondary-attribute";
        switch (parts[0]) {
          case 0:
            out.term = "vt100";
            break;
          case 1:
            out.term = "vt220";
            break;
          case 2:
            out.term = "vt240";
            break;
          case 18:
            out.term = "vt330";
            break;
          case 19:
            out.term = "vt340";
            break;
          case 24:
            out.term = "vt320";
            break;
          case 41:
            out.term = "vt420";
            break;
          case 61:
            out.term = "vt510";
            break;
          case 64:
            out.term = "vt520";
            break;
          case 65:
            out.term = "vt525";
            break;
        }
        out.firmwareVersion = parts[1];
        out.romCartridgeRegistrationNumber = parts[2];
      }
      out.deviceAttributes = out;
      this.emit("response", out);
      this.emit("response " + out.event, out);
      return;
    }
    if (parts = /^\x1b\[(\?)?(\d+)(?:;(\d+);(\d+);(\d+))?n/.exec(s)) {
      out.event = "device-status";
      out.code = "DSR";
      if (!parts[1] && parts[2] === "0" && !parts[3]) {
        out.type = "device-status";
        out.status = "OK";
        out.deviceStatus = out.status;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] && (parts[2] === "10" || parts[2] === "11") && !parts[3]) {
        out.type = "printer-status";
        out.status = parts[2] === "10" ? "ready" : "not ready";
        out.printerStatus = out.status;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] && (parts[2] === "20" || parts[2] === "21") && !parts[3]) {
        out.type = "udk-status";
        out.status = parts[2] === "20" ? "unlocked" : "locked";
        out.UDKStatus = out.status;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] && parts[2] === "27" && parts[3] === "1" && parts[4] === "0" && parts[5] === "0") {
        out.type = "keyboard-status";
        out.status = "OK";
        out.keyboardStatus = out.status;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] && (parts[2] === "53" || parts[2] === "50") && !parts[3]) {
        out.type = "locator-status";
        out.status = parts[2] === "53" ? "available" : "unavailable";
        out.locator = out.status;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      out.type = "error";
      out.text = "Unhandled: " + JSON.stringify(parts);
      out.error = out.text;
      this.emit("response", out);
      this.emit("response " + out.event, out);
      return;
    }
    if (parts = /^\x1b\[(\?)?(\d+);(\d+)R/.exec(s)) {
      out.event = "device-status";
      out.code = "DSR";
      out.type = "cursor-status";
      out.status = {
        x: +parts[3],
        y: +parts[2],
        page: !parts[1] ? undefined : 0
      };
      out.x = out.status.x;
      out.y = out.status.y;
      out.page = out.status.page;
      out.cursor = out.status;
      this.emit("response", out);
      this.emit("response " + out.event, out);
      return;
    }
    if (parts = /^\x1b\[(\d+)(?:;(\d+);(\d+))?t/.exec(s)) {
      out.event = "window-manipulation";
      out.code = "";
      if ((parts[1] === "1" || parts[1] === "2") && !parts[2]) {
        out.type = "window-state";
        out.state = parts[1] === "1" ? "non-iconified" : "iconified";
        out.windowState = out.state;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] === "3" && parts[2]) {
        out.type = "window-position";
        out.position = {
          x: +parts[2],
          y: +parts[3]
        };
        out.x = out.position.x;
        out.y = out.position.y;
        out.windowPosition = out.position;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] === "4" && parts[2]) {
        out.type = "window-size-pixels";
        out.size = {
          height: +parts[2],
          width: +parts[3]
        };
        out.height = out.size.height;
        out.width = out.size.width;
        out.windowSizePixels = out.size;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] === "8" && parts[2]) {
        out.type = "textarea-size";
        out.size = {
          height: +parts[2],
          width: +parts[3]
        };
        out.height = out.size.height;
        out.width = out.size.width;
        out.textAreaSizeCharacters = out.size;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] === "9" && parts[2]) {
        out.type = "screen-size";
        out.size = {
          height: +parts[2],
          width: +parts[3]
        };
        out.height = out.size.height;
        out.width = out.size.width;
        out.screenSizeCharacters = out.size;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      out.type = "error";
      out.text = "Unhandled: " + JSON.stringify(parts);
      out.error = out.text;
      this.emit("response", out);
      this.emit("response " + out.event, out);
      return;
    }
    if (parts = /^\x1b\](l|L)([^\x07\x1b]*)$/.exec(s)) {
      parts[2] = "rxvt";
      s = "\x1B]" + parts[1] + parts[2] + "\x1B\\";
    }
    if (parts = /^\x1b\](l|L)([^\x07\x1b]*)(?:\x07|\x1b\\)/.exec(s)) {
      out.event = "window-manipulation";
      out.code = "";
      if (parts[1] === "L") {
        out.type = "window-icon-label";
        out.text = parts[2];
        out.windowIconLabel = out.text;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      if (parts[1] === "l") {
        out.type = "window-title";
        out.text = parts[2];
        out.windowTitle = out.text;
        this.emit("response", out);
        this.emit("response " + out.event, out);
        return;
      }
      out.type = "error";
      out.text = "Unhandled: " + JSON.stringify(parts);
      out.error = out.text;
      this.emit("response", out);
      this.emit("response " + out.event, out);
      return;
    }
    if (parts = /^\x1b\[(\d+(?:;\d+){4})&w/.exec(s)) {
      parts = parts[1].split(";").map(function(ch) {
        return +ch;
      });
      out.event = "locator-position";
      out.code = "DECRQLP";
      switch (parts[0]) {
        case 0:
          out.status = "locator-unavailable";
          break;
        case 1:
          out.status = "request";
          break;
        case 2:
          out.status = "left-button-down";
          break;
        case 3:
          out.status = "left-button-up";
          break;
        case 4:
          out.status = "middle-button-down";
          break;
        case 5:
          out.status = "middle-button-up";
          break;
        case 6:
          out.status = "right-button-down";
          break;
        case 7:
          out.status = "right-button-up";
          break;
        case 8:
          out.status = "m4-button-down";
          break;
        case 9:
          out.status = "m4-button-up";
          break;
        case 10:
          out.status = "locator-outside";
          break;
      }
      out.mask = parts[1];
      out.row = parts[2];
      out.col = parts[3];
      out.page = parts[4];
      out.locatorPosition = out;
      this.emit("response", out);
      this.emit("response " + out.event, out);
      return;
    }
    if (parts = /^\x1b\](\d+);([^\x07\x1b]+)(?:\x07|\x1b\\)/.exec(s)) {
      out.event = "text-params";
      out.code = "Set Text Parameters";
      out.ps = +s[1];
      out.pt = s[2];
      this.emit("response", out);
      this.emit("response " + out.event, out);
    }
  };
  Program.prototype.response = function(name, text, callback, noBypass) {
    var self = this;
    if (arguments.length === 2) {
      callback = text;
      text = name;
      name = null;
    }
    if (!callback) {
      callback = function() {};
    }
    this.bindResponse();
    name = name ? "response " + name : "response";
    var onresponse;
    this.once(name, onresponse = function(event) {
      if (timeout)
        clearTimeout(timeout);
      if (event.type === "error") {
        return callback(new Error(event.event + ": " + event.text));
      }
      return callback(null, event);
    });
    var timeout = setTimeout(function() {
      self.removeListener(name, onresponse);
      return callback(new Error("Timeout."));
    }, 2000);
    return noBypass ? this._write(text) : this._twrite(text);
  };
  Program.prototype._owrite = Program.prototype.write = function(text) {
    if (!this.output.writable)
      return;
    return this.output.write(text);
  };
  Program.prototype._buffer = function(text) {
    if (this._exiting) {
      this.flush();
      this._owrite(text);
      return;
    }
    if (this._buf) {
      this._buf += text;
      return;
    }
    this._buf = text;
    nextTick(this._flush);
    return true;
  };
  Program.prototype.flush = function() {
    if (!this._buf)
      return;
    this._owrite(this._buf);
    this._buf = "";
  };
  Program.prototype._write = function(text) {
    if (this.ret)
      return text;
    if (this.useBuffer) {
      return this._buffer(text);
    }
    return this._owrite(text);
  };
  Program.prototype._twrite = function(data) {
    var self = this, iterations = 0, timer;
    if (this.tmux) {
      data = data.replace(/\x1b\\/g, "\x07");
      data = "\x1BPtmux;\x1B" + data + "\x1B\\";
      if (this.output.bytesWritten === 0) {
        timer = setInterval(function() {
          if (self.output.bytesWritten > 0 || ++iterations === 50) {
            clearInterval(timer);
            self.flush();
            self._owrite(data);
          }
        }, 100);
        return true;
      }
      this.flush();
      return this._owrite(data);
    }
    return this._write(data);
  };
  Program.prototype.echo = Program.prototype.print = function(text, attr) {
    return attr ? this._write(this.text(text, attr)) : this._write(text);
  };
  Program.prototype._ncoords = function() {
    if (this.x < 0)
      this.x = 0;
    else if (this.x >= this.cols)
      this.x = this.cols - 1;
    if (this.y < 0)
      this.y = 0;
    else if (this.y >= this.rows)
      this.y = this.rows - 1;
  };
  Program.prototype.setx = function(x) {
    return this.cursorCharAbsolute(x);
  };
  Program.prototype.sety = function(y) {
    return this.linePosAbsolute(y);
  };
  Program.prototype.move = function(x, y) {
    return this.cursorPos(y, x);
  };
  Program.prototype.omove = function(x, y) {
    if (!this.zero) {
      x = (x || 1) - 1;
      y = (y || 1) - 1;
    } else {
      x = x || 0;
      y = y || 0;
    }
    if (y === this.y && x === this.x) {
      return;
    }
    if (y === this.y) {
      if (x > this.x) {
        this.cuf(x - this.x);
      } else if (x < this.x) {
        this.cub(this.x - x);
      }
    } else if (x === this.x) {
      if (y > this.y) {
        this.cud(y - this.y);
      } else if (y < this.y) {
        this.cuu(this.y - y);
      }
    } else {
      if (!this.zero)
        x++, y++;
      this.cup(y, x);
    }
  };
  Program.prototype.rsetx = function(x) {
    if (!x)
      return;
    return x > 0 ? this.forward(x) : this.back(-x);
  };
  Program.prototype.rsety = function(y) {
    if (!y)
      return;
    return y > 0 ? this.up(y) : this.down(-y);
  };
  Program.prototype.rmove = function(x, y) {
    this.rsetx(x);
    this.rsety(y);
  };
  Program.prototype.simpleInsert = function(ch, i, attr) {
    return this._write(this.repeat(ch, i), attr);
  };
  Program.prototype.repeat = function(ch, i) {
    if (!i || i < 0)
      i = 0;
    return Array(i + 1).join(ch);
  };
  Program.prototype.__defineGetter__("title", function() {
    return this._title;
  });
  Program.prototype.__defineSetter__("title", function(title) {
    this.setTitle(title);
    return this._title;
  });
  Program.prototype.copyToClipboard = function(text) {
    if (this.isiTerm2) {
      this._twrite("\x1B]50;CopyToCliboard=" + text + "\x07");
      return true;
    }
    return false;
  };
  Program.prototype.cursorShape = function(shape, blink) {
    if (this.isiTerm2) {
      switch (shape) {
        case "block":
          if (!blink) {
            this._twrite("\x1B]50;CursorShape=0;BlinkingCursorEnabled=0\x07");
          } else {
            this._twrite("\x1B]50;CursorShape=0;BlinkingCursorEnabled=1\x07");
          }
          break;
        case "underline":
          if (!blink) {} else {}
          break;
        case "line":
          if (!blink) {
            this._twrite("\x1B]50;CursorShape=1;BlinkingCursorEnabled=0\x07");
          } else {
            this._twrite("\x1B]50;CursorShape=1;BlinkingCursorEnabled=1\x07");
          }
          break;
      }
      return true;
    } else if (this.term("xterm") || this.term("screen")) {
      switch (shape) {
        case "block":
          if (!blink) {
            this._twrite("\x1B[0 q");
          } else {
            this._twrite("\x1B[1 q");
          }
          break;
        case "underline":
          if (!blink) {
            this._twrite("\x1B[2 q");
          } else {
            this._twrite("\x1B[3 q");
          }
          break;
        case "line":
          if (!blink) {
            this._twrite("\x1B[4 q");
          } else {
            this._twrite("\x1B[5 q");
          }
          break;
      }
      return true;
    }
    return false;
  };
  Program.prototype.cursorColor = function(color) {
    if (this.term("xterm") || this.term("rxvt") || this.term("screen")) {
      this._twrite("\x1B]12;" + color + "\x07");
      return true;
    }
    return false;
  };
  Program.prototype.cursorReset = Program.prototype.resetCursor = function() {
    if (this.term("xterm") || this.term("rxvt") || this.term("screen")) {
      this._twrite("\x1B[0 q");
      this._twrite("\x1B]112\x07");
      this._twrite("\x1B]12;white\x07");
      return true;
    }
    return false;
  };
  Program.prototype.getTextParams = function(param, callback) {
    return this.response("text-params", "\x1B]" + param + ";?\x07", function(err, data) {
      if (err)
        return callback(err);
      return callback(null, data.pt);
    });
  };
  Program.prototype.getCursorColor = function(callback) {
    return this.getTextParams(12, callback);
  };
  Program.prototype.nul = function() {
    return this._write("\x80");
  };
  Program.prototype.bel = Program.prototype.bell = function() {
    if (this.has("bel"))
      return this.put.bel();
    return this._write("\x07");
  };
  Program.prototype.vtab = function() {
    this.y++;
    this._ncoords();
    return this._write("\v");
  };
  Program.prototype.ff = Program.prototype.form = function() {
    if (this.has("ff"))
      return this.put.ff();
    return this._write("\f");
  };
  Program.prototype.kbs = Program.prototype.backspace = function() {
    this.x--;
    this._ncoords();
    if (this.has("kbs"))
      return this.put.kbs();
    return this._write("\b");
  };
  Program.prototype.ht = Program.prototype.tab = function() {
    this.x += 8;
    this._ncoords();
    if (this.has("ht"))
      return this.put.ht();
    return this._write("\t");
  };
  Program.prototype.shiftOut = function() {
    return this._write("\x0E");
  };
  Program.prototype.shiftIn = function() {
    return this._write("\x0F");
  };
  Program.prototype.cr = Program.prototype.return = function() {
    this.x = 0;
    if (this.has("cr"))
      return this.put.cr();
    return this._write("\r");
  };
  Program.prototype.nel = Program.prototype.newline = Program.prototype.feed = function() {
    if (this.tput && this.tput.bools.eat_newline_glitch && this.x >= this.cols) {
      return;
    }
    this.x = 0;
    this.y++;
    this._ncoords();
    if (this.has("nel"))
      return this.put.nel();
    return this._write(`
`);
  };
  Program.prototype.ind = Program.prototype.index = function() {
    this.y++;
    this._ncoords();
    if (this.tput)
      return this.put.ind();
    return this._write("\x1BD");
  };
  Program.prototype.ri = Program.prototype.reverse = Program.prototype.reverseIndex = function() {
    this.y--;
    this._ncoords();
    if (this.tput)
      return this.put.ri();
    return this._write("\x1BM");
  };
  Program.prototype.nextLine = function() {
    this.y++;
    this.x = 0;
    this._ncoords();
    if (this.has("nel"))
      return this.put.nel();
    return this._write("\x1BE");
  };
  Program.prototype.reset = function() {
    this.x = this.y = 0;
    if (this.has("rs1") || this.has("ris")) {
      return this.has("rs1") ? this.put.rs1() : this.put.ris();
    }
    return this._write("\x1Bc");
  };
  Program.prototype.tabSet = function() {
    if (this.tput)
      return this.put.hts();
    return this._write("\x1BH");
  };
  Program.prototype.sc = Program.prototype.saveCursor = function(key) {
    if (key)
      return this.lsaveCursor(key);
    this.savedX = this.x || 0;
    this.savedY = this.y || 0;
    if (this.tput)
      return this.put.sc();
    return this._write("\x1B7");
  };
  Program.prototype.rc = Program.prototype.restoreCursor = function(key, hide) {
    if (key)
      return this.lrestoreCursor(key, hide);
    this.x = this.savedX || 0;
    this.y = this.savedY || 0;
    if (this.tput)
      return this.put.rc();
    return this._write("\x1B8");
  };
  Program.prototype.lsaveCursor = function(key) {
    key = key || "local";
    this._saved = this._saved || {};
    this._saved[key] = this._saved[key] || {};
    this._saved[key].x = this.x;
    this._saved[key].y = this.y;
    this._saved[key].hidden = this.cursorHidden;
  };
  Program.prototype.lrestoreCursor = function(key, hide) {
    var pos;
    key = key || "local";
    if (!this._saved || !this._saved[key])
      return;
    pos = this._saved[key];
    this.cup(pos.y, pos.x);
    if (hide && pos.hidden !== this.cursorHidden) {
      if (pos.hidden) {
        this.hideCursor();
      } else {
        this.showCursor();
      }
    }
  };
  Program.prototype.lineHeight = function() {
    return this._write("\x1B#");
  };
  Program.prototype.charset = function(val, level) {
    level = level || 0;
    switch (level) {
      case 0:
        level = "(";
        break;
      case 1:
        level = ")";
        break;
      case 2:
        level = "*";
        break;
      case 3:
        level = "+";
        break;
    }
    var name = typeof val === "string" ? val.toLowerCase() : val;
    switch (name) {
      case "acs":
      case "scld":
        if (this.tput)
          return this.put.smacs();
        val = "0";
        break;
      case "uk":
        val = "A";
        break;
      case "us":
      case "usascii":
      case "ascii":
        if (this.tput)
          return this.put.rmacs();
        val = "B";
        break;
      case "dutch":
        val = "4";
        break;
      case "finnish":
        val = "C";
        val = "5";
        break;
      case "french":
        val = "R";
        break;
      case "frenchcanadian":
        val = "Q";
        break;
      case "german":
        val = "K";
        break;
      case "italian":
        val = "Y";
        break;
      case "norwegiandanish":
        val = "E";
        val = "6";
        break;
      case "spanish":
        val = "Z";
        break;
      case "swedish":
        val = "H";
        val = "7";
        break;
      case "swiss":
        val = "=";
        break;
      case "isolatin":
        val = "/A";
        break;
      default:
        if (this.tput)
          return this.put.rmacs();
        val = "B";
        break;
    }
    return this._write("\x1B(" + val);
  };
  Program.prototype.enter_alt_charset_mode = Program.prototype.as = Program.prototype.smacs = function() {
    return this.charset("acs");
  };
  Program.prototype.exit_alt_charset_mode = Program.prototype.ae = Program.prototype.rmacs = function() {
    return this.charset("ascii");
  };
  Program.prototype.setG = function(val) {
    switch (val) {
      case 1:
        val = "~";
        break;
      case 2:
        val = "n";
        val = "}";
        val = "N";
        break;
      case 3:
        val = "o";
        val = "|";
        val = "O";
        break;
    }
    return this._write("\x1B" + val);
  };
  Program.prototype.setTitle = function(title) {
    this._title = title;
    return this._twrite("\x1B]0;" + title + "\x07");
  };
  Program.prototype.resetColors = function(param) {
    if (this.has("Cr")) {
      return this.put.Cr(param);
    }
    return this._twrite("\x1B]112\x07");
  };
  Program.prototype.dynamicColors = function(param) {
    if (this.has("Cs")) {
      return this.put.Cs(param);
    }
    return this._twrite("\x1B]12;" + param + "\x07");
  };
  Program.prototype.selData = function(a, b) {
    if (this.has("Ms")) {
      return this.put.Ms(a, b);
    }
    return this._twrite("\x1B]52;" + a + ";" + b + "\x07");
  };
  Program.prototype.cuu = Program.prototype.up = Program.prototype.cursorUp = function(param) {
    this.y -= param || 1;
    this._ncoords();
    if (this.tput) {
      if (!this.tput.strings.parm_up_cursor) {
        return this._write(this.repeat(this.tput.cuu1(), param));
      }
      return this.put.cuu(param);
    }
    return this._write("\x1B[" + (param || "") + "A");
  };
  Program.prototype.cud = Program.prototype.down = Program.prototype.cursorDown = function(param) {
    this.y += param || 1;
    this._ncoords();
    if (this.tput) {
      if (!this.tput.strings.parm_down_cursor) {
        return this._write(this.repeat(this.tput.cud1(), param));
      }
      return this.put.cud(param);
    }
    return this._write("\x1B[" + (param || "") + "B");
  };
  Program.prototype.cuf = Program.prototype.right = Program.prototype.forward = Program.prototype.cursorForward = function(param) {
    this.x += param || 1;
    this._ncoords();
    if (this.tput) {
      if (!this.tput.strings.parm_right_cursor) {
        return this._write(this.repeat(this.tput.cuf1(), param));
      }
      return this.put.cuf(param);
    }
    return this._write("\x1B[" + (param || "") + "C");
  };
  Program.prototype.cub = Program.prototype.left = Program.prototype.back = Program.prototype.cursorBackward = function(param) {
    this.x -= param || 1;
    this._ncoords();
    if (this.tput) {
      if (!this.tput.strings.parm_left_cursor) {
        return this._write(this.repeat(this.tput.cub1(), param));
      }
      return this.put.cub(param);
    }
    return this._write("\x1B[" + (param || "") + "D");
  };
  Program.prototype.cup = Program.prototype.pos = Program.prototype.cursorPos = function(row, col) {
    if (!this.zero) {
      row = (row || 1) - 1;
      col = (col || 1) - 1;
    } else {
      row = row || 0;
      col = col || 0;
    }
    this.x = col;
    this.y = row;
    this._ncoords();
    if (this.tput)
      return this.put.cup(row, col);
    return this._write("\x1B[" + (row + 1) + ";" + (col + 1) + "H");
  };
  Program.prototype.ed = Program.prototype.eraseInDisplay = function(param) {
    if (this.tput) {
      switch (param) {
        case "above":
          param = 1;
          break;
        case "all":
          param = 2;
          break;
        case "saved":
          param = 3;
          break;
        case "below":
        default:
          param = 0;
          break;
      }
      return this.put.ed(param);
    }
    switch (param) {
      case "above":
        return this._write("X1b[1J");
      case "all":
        return this._write("\x1B[2J");
      case "saved":
        return this._write("\x1B[3J");
      case "below":
      default:
        return this._write("\x1B[J");
    }
  };
  Program.prototype.clear = function() {
    this.x = 0;
    this.y = 0;
    if (this.tput)
      return this.put.clear();
    return this._write("\x1B[H\x1B[J");
  };
  Program.prototype.el = Program.prototype.eraseInLine = function(param) {
    if (this.tput) {
      switch (param) {
        case "left":
          param = 1;
          break;
        case "all":
          param = 2;
          break;
        case "right":
        default:
          param = 0;
          break;
      }
      return this.put.el(param);
    }
    switch (param) {
      case "left":
        return this._write("\x1B[1K");
      case "all":
        return this._write("\x1B[2K");
      case "right":
      default:
        return this._write("\x1B[K");
    }
  };
  Program.prototype.sgr = Program.prototype.attr = Program.prototype.charAttributes = function(param, val) {
    return this._write(this._attr(param, val));
  };
  Program.prototype.text = function(text, attr) {
    return this._attr(attr, true) + text + this._attr(attr, false);
  };
  Program.prototype._attr = function(param, val) {
    var self = this, parts, color, m;
    if (Array.isArray(param)) {
      parts = param;
      param = parts[0] || "normal";
    } else {
      param = param || "normal";
      parts = param.split(/\s*[,;]\s*/);
    }
    if (parts.length > 1) {
      var used = {}, out = [];
      parts.forEach(function(part) {
        part = self._attr(part, val).slice(2, -1);
        if (part === "")
          return;
        if (used[part])
          return;
        used[part] = true;
        out.push(part);
      });
      return "\x1B[" + out.join(";") + "m";
    }
    if (param.indexOf("no ") === 0) {
      param = param.substring(3);
      val = false;
    } else if (param.indexOf("!") === 0) {
      param = param.substring(1);
      val = false;
    }
    switch (param) {
      case "normal":
      case "default":
        if (val === false)
          return "";
        return "\x1B[m";
      case "bold":
        return val === false ? "\x1B[22m" : "\x1B[1m";
      case "ul":
      case "underline":
      case "underlined":
        return val === false ? "\x1B[24m" : "\x1B[4m";
      case "blink":
        return val === false ? "\x1B[25m" : "\x1B[5m";
      case "inverse":
        return val === false ? "\x1B[27m" : "\x1B[7m";
      case "invisible":
        return val === false ? "\x1B[28m" : "\x1B[8m";
      case "black fg":
        return val === false ? "\x1B[39m" : "\x1B[30m";
      case "red fg":
        return val === false ? "\x1B[39m" : "\x1B[31m";
      case "green fg":
        return val === false ? "\x1B[39m" : "\x1B[32m";
      case "yellow fg":
        return val === false ? "\x1B[39m" : "\x1B[33m";
      case "blue fg":
        return val === false ? "\x1B[39m" : "\x1B[34m";
      case "magenta fg":
        return val === false ? "\x1B[39m" : "\x1B[35m";
      case "cyan fg":
        return val === false ? "\x1B[39m" : "\x1B[36m";
      case "white fg":
      case "light grey fg":
      case "light gray fg":
      case "bright grey fg":
      case "bright gray fg":
        return val === false ? "\x1B[39m" : "\x1B[37m";
      case "default fg":
        if (val === false)
          return "";
        return "\x1B[39m";
      case "black bg":
        return val === false ? "\x1B[49m" : "\x1B[40m";
      case "red bg":
        return val === false ? "\x1B[49m" : "\x1B[41m";
      case "green bg":
        return val === false ? "\x1B[49m" : "\x1B[42m";
      case "yellow bg":
        return val === false ? "\x1B[49m" : "\x1B[43m";
      case "blue bg":
        return val === false ? "\x1B[49m" : "\x1B[44m";
      case "magenta bg":
        return val === false ? "\x1B[49m" : "\x1B[45m";
      case "cyan bg":
        return val === false ? "\x1B[49m" : "\x1B[46m";
      case "white bg":
      case "light grey bg":
      case "light gray bg":
      case "bright grey bg":
      case "bright gray bg":
        return val === false ? "\x1B[49m" : "\x1B[47m";
      case "default bg":
        if (val === false)
          return "";
        return "\x1B[49m";
      case "light black fg":
      case "bright black fg":
      case "grey fg":
      case "gray fg":
        return val === false ? "\x1B[39m" : "\x1B[90m";
      case "light red fg":
      case "bright red fg":
        return val === false ? "\x1B[39m" : "\x1B[91m";
      case "light green fg":
      case "bright green fg":
        return val === false ? "\x1B[39m" : "\x1B[92m";
      case "light yellow fg":
      case "bright yellow fg":
        return val === false ? "\x1B[39m" : "\x1B[93m";
      case "light blue fg":
      case "bright blue fg":
        return val === false ? "\x1B[39m" : "\x1B[94m";
      case "light magenta fg":
      case "bright magenta fg":
        return val === false ? "\x1B[39m" : "\x1B[95m";
      case "light cyan fg":
      case "bright cyan fg":
        return val === false ? "\x1B[39m" : "\x1B[96m";
      case "light white fg":
      case "bright white fg":
        return val === false ? "\x1B[39m" : "\x1B[97m";
      case "light black bg":
      case "bright black bg":
      case "grey bg":
      case "gray bg":
        return val === false ? "\x1B[49m" : "\x1B[100m";
      case "light red bg":
      case "bright red bg":
        return val === false ? "\x1B[49m" : "\x1B[101m";
      case "light green bg":
      case "bright green bg":
        return val === false ? "\x1B[49m" : "\x1B[102m";
      case "light yellow bg":
      case "bright yellow bg":
        return val === false ? "\x1B[49m" : "\x1B[103m";
      case "light blue bg":
      case "bright blue bg":
        return val === false ? "\x1B[49m" : "\x1B[104m";
      case "light magenta bg":
      case "bright magenta bg":
        return val === false ? "\x1B[49m" : "\x1B[105m";
      case "light cyan bg":
      case "bright cyan bg":
        return val === false ? "\x1B[49m" : "\x1B[106m";
      case "light white bg":
      case "bright white bg":
        return val === false ? "\x1B[49m" : "\x1B[107m";
      case "default fg bg":
        if (val === false)
          return "";
        return this.term("rxvt") ? "\x1B[100m" : "\x1B[39;49m";
      default:
        if (param[0] === "#") {
          param = param.replace(/#(?:[0-9a-f]{3}){1,2}/i, colors.match);
        }
        m = /^(-?\d+) (fg|bg)$/.exec(param);
        if (m) {
          color = +m[1];
          if (val === false || color === -1) {
            return this._attr("default " + m[2]);
          }
          color = colors.reduce(color, this.tput.colors);
          if (color < 16 || this.tput && this.tput.colors <= 16) {
            if (m[2] === "fg") {
              if (color < 8) {
                color += 30;
              } else if (color < 16) {
                color -= 8;
                color += 90;
              }
            } else if (m[2] === "bg") {
              if (color < 8) {
                color += 40;
              } else if (color < 16) {
                color -= 8;
                color += 100;
              }
            }
            return "\x1B[" + color + "m";
          }
          if (m[2] === "fg") {
            return "\x1B[38;5;" + color + "m";
          }
          if (m[2] === "bg") {
            return "\x1B[48;5;" + color + "m";
          }
        }
        if (/^[\d;]*$/.test(param)) {
          return "\x1B[" + param + "m";
        }
        return null;
    }
  };
  Program.prototype.fg = Program.prototype.setForeground = function(color, val) {
    color = color.split(/\s*[,;]\s*/).join(" fg, ") + " fg";
    return this.attr(color, val);
  };
  Program.prototype.bg = Program.prototype.setBackground = function(color, val) {
    color = color.split(/\s*[,;]\s*/).join(" bg, ") + " bg";
    return this.attr(color, val);
  };
  Program.prototype.dsr = Program.prototype.deviceStatus = function(param, callback, dec, noBypass) {
    if (dec) {
      return this.response("device-status", "\x1B[?" + (param || "0") + "n", callback, noBypass);
    }
    return this.response("device-status", "\x1B[" + (param || "0") + "n", callback, noBypass);
  };
  Program.prototype.getCursor = function(callback) {
    return this.deviceStatus(6, callback, false, true);
  };
  Program.prototype.saveReportedCursor = function(callback) {
    var self = this;
    if (this.tput.strings.user7 === "\x1B[6n" || this.term("screen")) {
      return this.getCursor(function(err, data) {
        if (data) {
          self._rx = data.status.x;
          self._ry = data.status.y;
        }
        if (!callback)
          return;
        return callback(err);
      });
    }
    if (!callback)
      return;
    return callback();
  };
  Program.prototype.restoreReportedCursor = function() {
    if (this._rx == null)
      return;
    return this.cup(this._ry, this._rx);
  };
  Program.prototype.ich = Program.prototype.insertChars = function(param) {
    this.x += param || 1;
    this._ncoords();
    if (this.tput)
      return this.put.ich(param);
    return this._write("\x1B[" + (param || 1) + "@");
  };
  Program.prototype.cnl = Program.prototype.cursorNextLine = function(param) {
    this.y += param || 1;
    this._ncoords();
    return this._write("\x1B[" + (param || "") + "E");
  };
  Program.prototype.cpl = Program.prototype.cursorPrecedingLine = function(param) {
    this.y -= param || 1;
    this._ncoords();
    return this._write("\x1B[" + (param || "") + "F");
  };
  Program.prototype.cha = Program.prototype.cursorCharAbsolute = function(param) {
    if (!this.zero) {
      param = (param || 1) - 1;
    } else {
      param = param || 0;
    }
    this.x = param;
    this.y = 0;
    this._ncoords();
    if (this.tput)
      return this.put.hpa(param);
    return this._write("\x1B[" + (param + 1) + "G");
  };
  Program.prototype.il = Program.prototype.insertLines = function(param) {
    if (this.tput)
      return this.put.il(param);
    return this._write("\x1B[" + (param || "") + "L");
  };
  Program.prototype.dl = Program.prototype.deleteLines = function(param) {
    if (this.tput)
      return this.put.dl(param);
    return this._write("\x1B[" + (param || "") + "M");
  };
  Program.prototype.dch = Program.prototype.deleteChars = function(param) {
    if (this.tput)
      return this.put.dch(param);
    return this._write("\x1B[" + (param || "") + "P");
  };
  Program.prototype.ech = Program.prototype.eraseChars = function(param) {
    if (this.tput)
      return this.put.ech(param);
    return this._write("\x1B[" + (param || "") + "X");
  };
  Program.prototype.hpa = Program.prototype.charPosAbsolute = function(param) {
    this.x = param || 0;
    this._ncoords();
    if (this.tput) {
      return this.put.hpa.apply(this.put, arguments);
    }
    param = slice.call(arguments).join(";");
    return this._write("\x1B[" + (param || "") + "`");
  };
  Program.prototype.hpr = Program.prototype.HPositionRelative = function(param) {
    if (this.tput)
      return this.cuf(param);
    this.x += param || 1;
    this._ncoords();
    return this._write("\x1B[" + (param || "") + "a");
  };
  Program.prototype.da = Program.prototype.sendDeviceAttributes = function(param, callback) {
    return this.response("device-attributes", "\x1B[" + (param || "") + "c", callback);
  };
  Program.prototype.vpa = Program.prototype.linePosAbsolute = function(param) {
    this.y = param || 1;
    this._ncoords();
    if (this.tput) {
      return this.put.vpa.apply(this.put, arguments);
    }
    param = slice.call(arguments).join(";");
    return this._write("\x1B[" + (param || "") + "d");
  };
  Program.prototype.vpr = Program.prototype.VPositionRelative = function(param) {
    if (this.tput)
      return this.cud(param);
    this.y += param || 1;
    this._ncoords();
    return this._write("\x1B[" + (param || "") + "e");
  };
  Program.prototype.hvp = Program.prototype.HVPosition = function(row, col) {
    if (!this.zero) {
      row = (row || 1) - 1;
      col = (col || 1) - 1;
    } else {
      row = row || 0;
      col = col || 0;
    }
    this.y = row;
    this.x = col;
    this._ncoords();
    if (this.tput)
      return this.put.cup(row, col);
    return this._write("\x1B[" + (row + 1) + ";" + (col + 1) + "f");
  };
  Program.prototype.sm = Program.prototype.setMode = function() {
    var param = slice.call(arguments).join(";");
    return this._write("\x1B[" + (param || "") + "h");
  };
  Program.prototype.decset = function() {
    var param = slice.call(arguments).join(";");
    return this.setMode("?" + param);
  };
  Program.prototype.dectcem = Program.prototype.cnorm = Program.prototype.cvvis = Program.prototype.showCursor = function() {
    this.cursorHidden = false;
    if (this.tput)
      return this.put.cnorm();
    return this.setMode("?25");
  };
  Program.prototype.alternate = Program.prototype.smcup = Program.prototype.alternateBuffer = function() {
    this.isAlt = true;
    if (this.tput)
      return this.put.smcup();
    if (this.term("vt") || this.term("linux"))
      return;
    this.setMode("?47");
    return this.setMode("?1049");
  };
  Program.prototype.rm = Program.prototype.resetMode = function() {
    var param = slice.call(arguments).join(";");
    return this._write("\x1B[" + (param || "") + "l");
  };
  Program.prototype.decrst = function() {
    var param = slice.call(arguments).join(";");
    return this.resetMode("?" + param);
  };
  Program.prototype.dectcemh = Program.prototype.cursor_invisible = Program.prototype.vi = Program.prototype.civis = Program.prototype.hideCursor = function() {
    this.cursorHidden = true;
    if (this.tput)
      return this.put.civis();
    return this.resetMode("?25");
  };
  Program.prototype.rmcup = Program.prototype.normalBuffer = function() {
    this.isAlt = false;
    if (this.tput)
      return this.put.rmcup();
    this.resetMode("?47");
    return this.resetMode("?1049");
  };
  Program.prototype.enableMouse = function() {
    if (process.env.BLESSED_FORCE_MODES) {
      var modes = process.env.BLESSED_FORCE_MODES.split(",");
      var options = {};
      for (var n = 0;n < modes.length; ++n) {
        var pair = modes[n].split("=");
        var v = pair[1] !== "0";
        switch (pair[0].toUpperCase()) {
          case "SGRMOUSE":
            options.sgrMouse = v;
            break;
          case "UTFMOUSE":
            options.utfMouse = v;
            break;
          case "VT200MOUSE":
            options.vt200Mouse = v;
            break;
          case "URXVTMOUSE":
            options.urxvtMouse = v;
            break;
          case "X10MOUSE":
            options.x10Mouse = v;
            break;
          case "DECMOUSE":
            options.decMouse = v;
            break;
          case "PTERMMOUSE":
            options.ptermMouse = v;
            break;
          case "JSBTERMMOUSE":
            options.jsbtermMouse = v;
            break;
          case "VT200HILITE":
            options.vt200Hilite = v;
            break;
          case "GPMMOUSE":
            options.gpmMouse = v;
            break;
          case "CELLMOTION":
            options.cellMotion = v;
            break;
          case "ALLMOTION":
            options.allMotion = v;
            break;
          case "SENDFOCUS":
            options.sendFocus = v;
            break;
        }
      }
      return this.setMouse(options, true);
    }
    if (this.term("rxvt-unicode")) {
      return this.setMouse({
        urxvtMouse: true,
        cellMotion: true,
        allMotion: true
      }, true);
    }
    if (this.term("rxvt")) {
      return this.setMouse({
        vt200Mouse: true,
        x10Mouse: true,
        cellMotion: true,
        allMotion: true
      }, true);
    }
    if (this.isVTE) {
      return this.setMouse({
        sgrMouse: true,
        cellMotion: true,
        allMotion: true
      }, true);
    }
    if (this.term("linux")) {
      return this.setMouse({
        vt200Mouse: true,
        gpmMouse: true
      }, true);
    }
    if (this.term("xterm") || this.term("screen") || this.tput && this.tput.strings.key_mouse) {
      return this.setMouse({
        vt200Mouse: true,
        utfMouse: true,
        cellMotion: true,
        allMotion: true
      }, true);
    }
  };
  Program.prototype.disableMouse = function() {
    if (!this._currentMouse)
      return;
    var obj = {};
    Object.keys(this._currentMouse).forEach(function(key) {
      obj[key] = false;
    });
    return this.setMouse(obj, false);
  };
  Program.prototype.setMouse = function(opt, enable) {
    if (opt.normalMouse != null) {
      opt.vt200Mouse = opt.normalMouse;
      opt.allMotion = opt.normalMouse;
    }
    if (opt.hiliteTracking != null) {
      opt.vt200Hilite = opt.hiliteTracking;
    }
    if (enable === true) {
      if (this._currentMouse) {
        this.setMouse(opt);
        Object.keys(opt).forEach(function(key) {
          this._currentMouse[key] = opt[key];
        }, this);
        return;
      }
      this._currentMouse = opt;
      this.mouseEnabled = true;
    } else if (enable === false) {
      delete this._currentMouse;
      this.mouseEnabled = false;
    }
    if (opt.x10Mouse != null) {
      if (opt.x10Mouse)
        this.setMode("?9");
      else
        this.resetMode("?9");
    }
    if (opt.vt200Mouse != null) {
      if (opt.vt200Mouse)
        this.setMode("?1000");
      else
        this.resetMode("?1000");
    }
    if (opt.vt200Hilite != null) {
      if (opt.vt200Hilite)
        this.setMode("?1001");
      else
        this.resetMode("?1001");
    }
    if (opt.cellMotion != null) {
      if (opt.cellMotion)
        this.setMode("?1002");
      else
        this.resetMode("?1002");
    }
    if (opt.allMotion != null) {
      if (this.tmux && this.tmuxVersion >= 2) {
        if (opt.allMotion)
          this._twrite("\x1B[?1003h");
        else
          this._twrite("\x1B[?1003l");
      } else {
        if (opt.allMotion)
          this.setMode("?1003");
        else
          this.resetMode("?1003");
      }
    }
    if (opt.sendFocus != null) {
      if (opt.sendFocus)
        this.setMode("?1004");
      else
        this.resetMode("?1004");
    }
    if (opt.utfMouse != null) {
      if (opt.utfMouse)
        this.setMode("?1005");
      else
        this.resetMode("?1005");
    }
    if (opt.sgrMouse != null) {
      if (opt.sgrMouse)
        this.setMode("?1006");
      else
        this.resetMode("?1006");
    }
    if (opt.urxvtMouse != null) {
      if (opt.urxvtMouse)
        this.setMode("?1015");
      else
        this.resetMode("?1015");
    }
    if (opt.decMouse != null) {
      if (opt.decMouse)
        this._write("\x1B[1;2'z\x1B[1;3'{");
      else
        this._write("\x1B['z");
    }
    if (opt.ptermMouse != null) {
      if (opt.ptermMouse)
        this._write("\x1B[>1h\x1B[>6h\x1B[>7h\x1B[>1h\x1B[>9l");
      else
        this._write("\x1B[>1l\x1B[>6l\x1B[>7l\x1B[>1l\x1B[>9h");
    }
    if (opt.jsbtermMouse != null) {
      if (opt.jsbtermMouse)
        this._write("\x1B[0~ZwLMRK+1Q\x1B\\");
      else
        this._write("\x1B[0~ZwQ\x1B\\");
    }
    if (opt.gpmMouse != null) {
      if (opt.gpmMouse)
        this.enableGpm();
      else
        this.disableGpm();
    }
  };
  Program.prototype.decstbm = Program.prototype.csr = Program.prototype.setScrollRegion = function(top, bottom) {
    if (!this.zero) {
      top = (top || 1) - 1;
      bottom = (bottom || this.rows) - 1;
    } else {
      top = top || 0;
      bottom = bottom || this.rows - 1;
    }
    this.scrollTop = top;
    this.scrollBottom = bottom;
    this.x = 0;
    this.y = 0;
    this._ncoords();
    if (this.tput)
      return this.put.csr(top, bottom);
    return this._write("\x1B[" + (top + 1) + ";" + (bottom + 1) + "r");
  };
  Program.prototype.scA = Program.prototype.saveCursorA = function() {
    this.savedX = this.x;
    this.savedY = this.y;
    if (this.tput)
      return this.put.sc();
    return this._write("\x1B[s");
  };
  Program.prototype.rcA = Program.prototype.restoreCursorA = function() {
    this.x = this.savedX || 0;
    this.y = this.savedY || 0;
    if (this.tput)
      return this.put.rc();
    return this._write("\x1B[u");
  };
  Program.prototype.cht = Program.prototype.cursorForwardTab = function(param) {
    this.x += 8;
    this._ncoords();
    if (this.tput)
      return this.put.tab(param);
    return this._write("\x1B[" + (param || 1) + "I");
  };
  Program.prototype.su = Program.prototype.scrollUp = function(param) {
    this.y -= param || 1;
    this._ncoords();
    if (this.tput)
      return this.put.parm_index(param);
    return this._write("\x1B[" + (param || 1) + "S");
  };
  Program.prototype.sd = Program.prototype.scrollDown = function(param) {
    this.y += param || 1;
    this._ncoords();
    if (this.tput)
      return this.put.parm_rindex(param);
    return this._write("\x1B[" + (param || 1) + "T");
  };
  Program.prototype.initMouseTracking = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "T");
  };
  Program.prototype.resetTitleModes = function() {
    return this._write("\x1B[>" + slice.call(arguments).join(";") + "T");
  };
  Program.prototype.cbt = Program.prototype.cursorBackwardTab = function(param) {
    this.x -= 8;
    this._ncoords();
    if (this.tput)
      return this.put.cbt(param);
    return this._write("\x1B[" + (param || 1) + "Z");
  };
  Program.prototype.rep = Program.prototype.repeatPrecedingCharacter = function(param) {
    this.x += param || 1;
    this._ncoords();
    if (this.tput)
      return this.put.rep(param);
    return this._write("\x1B[" + (param || 1) + "b");
  };
  Program.prototype.tbc = Program.prototype.tabClear = function(param) {
    if (this.tput)
      return this.put.tbc(param);
    return this._write("\x1B[" + (param || 0) + "g");
  };
  Program.prototype.mc = Program.prototype.mediaCopy = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "i");
  };
  Program.prototype.print_screen = Program.prototype.ps = Program.prototype.mc0 = function() {
    if (this.tput)
      return this.put.mc0();
    return this.mc("0");
  };
  Program.prototype.prtr_on = Program.prototype.po = Program.prototype.mc5 = function() {
    if (this.tput)
      return this.put.mc5();
    return this.mc("5");
  };
  Program.prototype.prtr_off = Program.prototype.pf = Program.prototype.mc4 = function() {
    if (this.tput)
      return this.put.mc4();
    return this.mc("4");
  };
  Program.prototype.prtr_non = Program.prototype.pO = Program.prototype.mc5p = function() {
    if (this.tput)
      return this.put.mc5p();
    return this.mc("?5");
  };
  Program.prototype.setResources = function() {
    return this._write("\x1B[>" + slice.call(arguments).join(";") + "m");
  };
  Program.prototype.disableModifiers = function(param) {
    return this._write("\x1B[>" + (param || "") + "n");
  };
  Program.prototype.setPointerMode = function(param) {
    return this._write("\x1B[>" + (param || "") + "p");
  };
  Program.prototype.decstr = Program.prototype.rs2 = Program.prototype.softReset = function() {
    if (this.tput)
      return this.put.rs2();
    return this._write("\x1B[!p\x1B[?3;4l\x1B[4l\x1B>");
  };
  Program.prototype.decrqm = Program.prototype.requestAnsiMode = function(param) {
    return this._write("\x1B[" + (param || "") + "$p");
  };
  Program.prototype.decrqmp = Program.prototype.requestPrivateMode = function(param) {
    return this._write("\x1B[?" + (param || "") + "$p");
  };
  Program.prototype.decscl = Program.prototype.setConformanceLevel = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + '"p');
  };
  Program.prototype.decll = Program.prototype.loadLEDs = function(param) {
    return this._write("\x1B[" + (param || "") + "q");
  };
  Program.prototype.decscusr = Program.prototype.setCursorStyle = function(param) {
    switch (param) {
      case "blinking block":
        param = 1;
        break;
      case "block":
      case "steady block":
        param = 2;
        break;
      case "blinking underline":
        param = 3;
        break;
      case "underline":
      case "steady underline":
        param = 4;
        break;
      case "blinking bar":
        param = 5;
        break;
      case "bar":
      case "steady bar":
        param = 6;
        break;
    }
    if (param === 2 && this.has("Se")) {
      return this.put.Se();
    }
    if (this.has("Ss")) {
      return this.put.Ss(param);
    }
    return this._write("\x1B[" + (param || 1) + " q");
  };
  Program.prototype.decsca = Program.prototype.setCharProtectionAttr = function(param) {
    return this._write("\x1B[" + (param || 0) + '"q');
  };
  Program.prototype.restorePrivateValues = function() {
    return this._write("\x1B[?" + slice.call(arguments).join(";") + "r");
  };
  Program.prototype.deccara = Program.prototype.setAttrInRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "$r");
  };
  Program.prototype.savePrivateValues = function() {
    return this._write("\x1B[?" + slice.call(arguments).join(";") + "s");
  };
  Program.prototype.manipulateWindow = function() {
    var args = slice.call(arguments);
    var callback = typeof args[args.length - 1] === "function" ? args.pop() : function() {};
    return this.response("window-manipulation", "\x1B[" + args.join(";") + "t", callback);
  };
  Program.prototype.getWindowSize = function(callback) {
    return this.manipulateWindow(18, callback);
  };
  Program.prototype.decrara = Program.prototype.reverseAttrInRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "$t");
  };
  Program.prototype.setTitleModeFeature = function() {
    return this._twrite("\x1B[>" + slice.call(arguments).join(";") + "t");
  };
  Program.prototype.decswbv = Program.prototype.setWarningBellVolume = function(param) {
    return this._write("\x1B[" + (param || "") + " t");
  };
  Program.prototype.decsmbv = Program.prototype.setMarginBellVolume = function(param) {
    return this._write("\x1B[" + (param || "") + " u");
  };
  Program.prototype.deccra = Program.prototype.copyRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "$v");
  };
  Program.prototype.decefr = Program.prototype.enableFilterRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "'w");
  };
  Program.prototype.decreqtparm = Program.prototype.requestParameters = function(param) {
    return this._write("\x1B[" + (param || 0) + "x");
  };
  Program.prototype.decsace = Program.prototype.selectChangeExtent = function(param) {
    return this._write("\x1B[" + (param || 0) + "x");
  };
  Program.prototype.decfra = Program.prototype.fillRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "$x");
  };
  Program.prototype.decelr = Program.prototype.enableLocatorReporting = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "'z");
  };
  Program.prototype.decera = Program.prototype.eraseRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "$z");
  };
  Program.prototype.decsle = Program.prototype.setLocatorEvents = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "'{");
  };
  Program.prototype.decsera = Program.prototype.selectiveEraseRectangle = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + "${");
  };
  Program.prototype.decrqlp = Program.prototype.req_mouse_pos = Program.prototype.reqmp = Program.prototype.requestLocatorPosition = function(param, callback) {
    if (this.has("req_mouse_pos")) {
      var code = this.tput.req_mouse_pos(param);
      return this.response("locator-position", code, callback);
    }
    return this.response("locator-position", "\x1B[" + (param || "") + "'|", callback);
  };
  Program.prototype.decic = Program.prototype.insertColumns = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + " }");
  };
  Program.prototype.decdc = Program.prototype.deleteColumns = function() {
    return this._write("\x1B[" + slice.call(arguments).join(";") + " ~");
  };
  Program.prototype.out = function(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    this.ret = true;
    var out = this[name].apply(this, args);
    this.ret = false;
    return out;
  };
  Program.prototype.sigtstp = function(callback) {
    var resume = this.pause();
    process.once("SIGCONT", function() {
      resume();
      if (callback)
        callback();
    });
    process.kill(process.pid, "SIGTSTP");
  };
  Program.prototype.pause = function(callback) {
    var self = this, isAlt = this.isAlt, mouseEnabled = this.mouseEnabled;
    this.lsaveCursor("pause");
    if (isAlt)
      this.normalBuffer();
    this.showCursor();
    if (mouseEnabled)
      this.disableMouse();
    var write = this.output.write;
    this.output.write = function() {};
    if (this.input.setRawMode) {
      this.input.setRawMode(false);
    }
    this.input.pause();
    return this._resume = function() {
      delete self._resume;
      if (self.input.setRawMode) {
        self.input.setRawMode(true);
      }
      self.input.resume();
      self.output.write = write;
      if (isAlt)
        self.alternateBuffer();
      if (mouseEnabled)
        self.enableMouse();
      self.lrestoreCursor("pause", true);
      if (callback)
        callback();
    };
  };
  Program.prototype.resume = function() {
    if (this._resume)
      return this._resume();
  };
  function unshiftEvent(obj, event, listener) {
    var listeners = obj.listeners(event);
    obj.removeAllListeners(event);
    obj.on(event, listener);
    listeners.forEach(function(listener2) {
      obj.on(event, listener2);
    });
  }
  function merge(out) {
    slice.call(arguments, 1).forEach(function(obj) {
      Object.keys(obj).forEach(function(key) {
        out[key] = obj[key];
      });
    });
    return out;
  }
  module.exports = Program;
});

// node_modules/neo-blessed/lib/widget.js
var require_widget = __commonJS((exports) => {
  var widget = exports;
  widget.classes = [
    "Node",
    "Screen",
    "Element",
    "Box",
    "Text",
    "Line",
    "ScrollableBox",
    "ScrollableText",
    "BigText",
    "List",
    "Form",
    "Input",
    "Textarea",
    "Textbox",
    "Button",
    "ProgressBar",
    "FileManager",
    "Checkbox",
    "RadioSet",
    "RadioButton",
    "Prompt",
    "Question",
    "Message",
    "Loading",
    "Listbar",
    "Log",
    "Table",
    "ListTable",
    "Terminal",
    "Image",
    "ANSIImage",
    "OverlayImage",
    "Video",
    "Layout"
  ];
  widget.classes.forEach(function(name) {
    var file = name.toLowerCase();
    widget[name] = widget[file] = __require("./widgets/" + file);
  });
  widget.aliases = {
    ListBar: "Listbar",
    PNG: "ANSIImage"
  };
  Object.keys(widget.aliases).forEach(function(key) {
    var name = widget.aliases[key];
    widget[key] = widget[name];
    widget[key.toLowerCase()] = widget[name];
  });
});

// node_modules/neo-blessed/lib/unicode.js
var require_unicode = __commonJS((exports) => {
  var stringFromCharCode = String.fromCharCode;
  var floor = Math.floor;
  exports.charWidth = function(str, i) {
    var point = typeof str !== "number" ? exports.codePointAt(str, i || 0) : str;
    if (point === 0)
      return 0;
    if (point === 9) {
      if (!exports.blessed) {
        exports.blessed = require_blessed();
      }
      return exports.blessed.screen.global ? exports.blessed.screen.global.tabc.length : 8;
    }
    if (point < 32 || point >= 127 && point < 160) {
      return 0;
    }
    if (exports.combining[point]) {
      return 0;
    }
    if (point === 12288 || 65281 <= point && point <= 65376 || 65504 <= point && point <= 65510) {
      return 2;
    }
    if (4352 <= point && point <= 4447 || 4515 <= point && point <= 4519 || 4602 <= point && point <= 4607 || 9001 <= point && point <= 9002 || 11904 <= point && point <= 11929 || 11931 <= point && point <= 12019 || 12032 <= point && point <= 12245 || 12272 <= point && point <= 12283 || 12289 <= point && point <= 12350 || 12353 <= point && point <= 12438 || 12441 <= point && point <= 12543 || 12549 <= point && point <= 12589 || 12593 <= point && point <= 12686 || 12688 <= point && point <= 12730 || 12736 <= point && point <= 12771 || 12784 <= point && point <= 12830 || 12832 <= point && point <= 12871 || 12880 <= point && point <= 13054 || 13056 <= point && point <= 19903 || 19968 <= point && point <= 42124 || 42128 <= point && point <= 42182 || 43360 <= point && point <= 43388 || 44032 <= point && point <= 55203 || 55216 <= point && point <= 55238 || 55243 <= point && point <= 55291 || 63744 <= point && point <= 64255 || 65040 <= point && point <= 65049 || 65072 <= point && point <= 65106 || 65108 <= point && point <= 65126 || 65128 <= point && point <= 65131 || 110592 <= point && point <= 110593 || 127488 <= point && point <= 127490 || 127504 <= point && point <= 127546 || 127552 <= point && point <= 127560 || 127568 <= point && point <= 127569 || 131072 <= point && point <= 194367 || 177984 <= point && point <= 196605 || 196608 <= point && point <= 262141) {
      return 2;
    }
    if (process.env.NCURSES_CJK_WIDTH) {
      if (point === 161 || point === 164 || 167 <= point && point <= 168 || point === 170 || 173 <= point && point <= 174 || 176 <= point && point <= 180 || 182 <= point && point <= 186 || 188 <= point && point <= 191 || point === 198 || point === 208 || 215 <= point && point <= 216 || 222 <= point && point <= 225 || point === 230 || 232 <= point && point <= 234 || 236 <= point && point <= 237 || point === 240 || 242 <= point && point <= 243 || 247 <= point && point <= 250 || point === 252 || point === 254 || point === 257 || point === 273 || point === 275 || point === 283 || 294 <= point && point <= 295 || point === 299 || 305 <= point && point <= 307 || point === 312 || 319 <= point && point <= 322 || point === 324 || 328 <= point && point <= 331 || point === 333 || 338 <= point && point <= 339 || 358 <= point && point <= 359 || point === 363 || point === 462 || point === 464 || point === 466 || point === 468 || point === 470 || point === 472 || point === 474 || point === 476 || point === 593 || point === 609 || point === 708 || point === 711 || 713 <= point && point <= 715 || point === 717 || point === 720 || 728 <= point && point <= 731 || point === 733 || point === 735 || 768 <= point && point <= 879 || 913 <= point && point <= 929 || 931 <= point && point <= 937 || 945 <= point && point <= 961 || 963 <= point && point <= 969 || point === 1025 || 1040 <= point && point <= 1103 || point === 1105 || point === 8208 || 8211 <= point && point <= 8214 || 8216 <= point && point <= 8217 || 8220 <= point && point <= 8221 || 8224 <= point && point <= 8226 || 8228 <= point && point <= 8231 || point === 8240 || 8242 <= point && point <= 8243 || point === 8245 || point === 8251 || point === 8254 || point === 8308 || point === 8319 || 8321 <= point && point <= 8324 || point === 8364 || point === 8451 || point === 8453 || point === 8457 || point === 8467 || point === 8470 || 8481 <= point && point <= 8482 || point === 8486 || point === 8491 || 8531 <= point && point <= 8532 || 8539 <= point && point <= 8542 || 8544 <= point && point <= 8555 || 8560 <= point && point <= 8569 || point === 8585 || 8592 <= point && point <= 8601 || 8632 <= point && point <= 8633 || point === 8658 || point === 8660 || point === 8679 || point === 8704 || 8706 <= point && point <= 8707 || 8711 <= point && point <= 8712 || point === 8715 || point === 8719 || point === 8721 || point === 8725 || point === 8730 || 8733 <= point && point <= 8736 || point === 8739 || point === 8741 || 8743 <= point && point <= 8748 || point === 8750 || 8756 <= point && point <= 8759 || 8764 <= point && point <= 8765 || point === 8776 || point === 8780 || point === 8786 || 8800 <= point && point <= 8801 || 8804 <= point && point <= 8807 || 8810 <= point && point <= 8811 || 8814 <= point && point <= 8815 || 8834 <= point && point <= 8835 || 8838 <= point && point <= 8839 || point === 8853 || point === 8857 || point === 8869 || point === 8895 || point === 8978 || 9312 <= point && point <= 9449 || 9451 <= point && point <= 9547 || 9552 <= point && point <= 9587 || 9600 <= point && point <= 9615 || 9618 <= point && point <= 9621 || 9632 <= point && point <= 9633 || 9635 <= point && point <= 9641 || 9650 <= point && point <= 9651 || 9654 <= point && point <= 9655 || 9660 <= point && point <= 9661 || 9664 <= point && point <= 9665 || 9670 <= point && point <= 9672 || point === 9675 || 9678 <= point && point <= 9681 || 9698 <= point && point <= 9701 || point === 9711 || 9733 <= point && point <= 9734 || point === 9737 || 9742 <= point && point <= 9743 || 9748 <= point && point <= 9749 || point === 9756 || point === 9758 || point === 9792 || point === 9794 || 9824 <= point && point <= 9825 || 9827 <= point && point <= 9829 || 9831 <= point && point <= 9834 || 9836 <= point && point <= 9837 || point === 9839 || 9886 <= point && point <= 9887 || 9918 <= point && point <= 9919 || 9924 <= point && point <= 9933 || 9935 <= point && point <= 9953 || point === 9955 || 9960 <= point && point <= 9983 || point === 10045 || point === 10071 || 10102 <= point && point <= 10111 || 11093 <= point && point <= 11097 || 12872 <= point && point <= 12879 || 57344 <= point && point <= 63743 || 65024 <= point && point <= 65039 || point === 65533 || 127232 <= point && point <= 127242 || 127248 <= point && point <= 127277 || 127280 <= point && point <= 127337 || 127344 <= point && point <= 127386 || 917760 <= point && point <= 917999 || 983040 <= point && point <= 1048573 || 1048576 <= point && point <= 1114109) {
        return +process.env.NCURSES_CJK_WIDTH || 1;
      }
    }
    return 1;
  };
  exports.strWidth = function(str) {
    var width = 0;
    for (var i = 0;i < str.length; i++) {
      width += exports.charWidth(str, i);
      if (exports.isSurrogate(str, i))
        i++;
    }
    return width;
  };
  exports.isSurrogate = function(str, i) {
    var point = typeof str !== "number" ? exports.codePointAt(str, i || 0) : str;
    return point > 65535;
  };
  exports.combiningTable = [
    [768, 879],
    [1155, 1158],
    [1160, 1161],
    [1425, 1469],
    [1471, 1471],
    [1473, 1474],
    [1476, 1477],
    [1479, 1479],
    [1536, 1539],
    [1552, 1557],
    [1611, 1630],
    [1648, 1648],
    [1750, 1764],
    [1767, 1768],
    [1770, 1773],
    [1807, 1807],
    [1809, 1809],
    [1840, 1866],
    [1958, 1968],
    [2027, 2035],
    [2305, 2306],
    [2364, 2364],
    [2369, 2376],
    [2381, 2381],
    [2385, 2388],
    [2402, 2403],
    [2433, 2433],
    [2492, 2492],
    [2497, 2500],
    [2509, 2509],
    [2530, 2531],
    [2561, 2562],
    [2620, 2620],
    [2625, 2626],
    [2631, 2632],
    [2635, 2637],
    [2672, 2673],
    [2689, 2690],
    [2748, 2748],
    [2753, 2757],
    [2759, 2760],
    [2765, 2765],
    [2786, 2787],
    [2817, 2817],
    [2876, 2876],
    [2879, 2879],
    [2881, 2883],
    [2893, 2893],
    [2902, 2902],
    [2946, 2946],
    [3008, 3008],
    [3021, 3021],
    [3134, 3136],
    [3142, 3144],
    [3146, 3149],
    [3157, 3158],
    [3260, 3260],
    [3263, 3263],
    [3270, 3270],
    [3276, 3277],
    [3298, 3299],
    [3393, 3395],
    [3405, 3405],
    [3530, 3530],
    [3538, 3540],
    [3542, 3542],
    [3633, 3633],
    [3636, 3642],
    [3655, 3662],
    [3761, 3761],
    [3764, 3769],
    [3771, 3772],
    [3784, 3789],
    [3864, 3865],
    [3893, 3893],
    [3895, 3895],
    [3897, 3897],
    [3953, 3966],
    [3968, 3972],
    [3974, 3975],
    [3984, 3991],
    [3993, 4028],
    [4038, 4038],
    [4141, 4144],
    [4146, 4146],
    [4150, 4151],
    [4153, 4153],
    [4184, 4185],
    [4448, 4607],
    [4959, 4959],
    [5906, 5908],
    [5938, 5940],
    [5970, 5971],
    [6002, 6003],
    [6068, 6069],
    [6071, 6077],
    [6086, 6086],
    [6089, 6099],
    [6109, 6109],
    [6155, 6157],
    [6313, 6313],
    [6432, 6434],
    [6439, 6440],
    [6450, 6450],
    [6457, 6459],
    [6679, 6680],
    [6912, 6915],
    [6964, 6964],
    [6966, 6970],
    [6972, 6972],
    [6978, 6978],
    [7019, 7027],
    [7616, 7626],
    [7678, 7679],
    [8203, 8207],
    [8234, 8238],
    [8288, 8291],
    [8298, 8303],
    [8400, 8431],
    [12330, 12335],
    [12441, 12442],
    [43014, 43014],
    [43019, 43019],
    [43045, 43046],
    [64286, 64286],
    [65024, 65039],
    [65056, 65059],
    [65279, 65279],
    [65529, 65531],
    [68097, 68099],
    [68101, 68102],
    [68108, 68111],
    [68152, 68154],
    [68159, 68159],
    [119143, 119145],
    [119155, 119170],
    [119173, 119179],
    [119210, 119213],
    [119362, 119364],
    [917505, 917505],
    [917536, 917631],
    [917760, 917999]
  ];
  exports.combining = exports.combiningTable.reduce(function(out, row) {
    for (var i = row[0];i <= row[1]; i++) {
      out[i] = true;
    }
    return out;
  }, {});
  exports.isCombining = function(str, i) {
    var point = typeof str !== "number" ? exports.codePointAt(str, i || 0) : str;
    return exports.combining[point] === true;
  };
  exports.codePointAt = function(str, position) {
    if (str == null) {
      throw TypeError();
    }
    var string = String(str);
    if (string.codePointAt) {
      return string.codePointAt(position);
    }
    var size = string.length;
    var index = position ? Number(position) : 0;
    if (index !== index) {
      index = 0;
    }
    if (index < 0 || index >= size) {
      return;
    }
    var first = string.charCodeAt(index);
    var second;
    if (first >= 55296 && first <= 56319 && size > index + 1) {
      second = string.charCodeAt(index + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  };
  exports.fromCodePoint = function() {
    if (String.fromCodePoint) {
      return String.fromCodePoint.apply(String, arguments);
    }
    var MAX_SIZE = 16384;
    var codeUnits = [];
    var highSurrogate;
    var lowSurrogate;
    var index = -1;
    var length = arguments.length;
    if (!length) {
      return "";
    }
    var result = "";
    while (++index < length) {
      var codePoint = Number(arguments[index]);
      if (!isFinite(codePoint) || codePoint < 0 || codePoint > 1114111 || floor(codePoint) !== codePoint) {
        throw RangeError("Invalid code point: " + codePoint);
      }
      if (codePoint <= 65535) {
        codeUnits.push(codePoint);
      } else {
        codePoint -= 65536;
        highSurrogate = (codePoint >> 10) + 55296;
        lowSurrogate = codePoint % 1024 + 56320;
        codeUnits.push(highSurrogate, lowSurrogate);
      }
      if (index + 1 === length || codeUnits.length > MAX_SIZE) {
        result += stringFromCharCode.apply(null, codeUnits);
        codeUnits.length = 0;
      }
    }
    return result;
  };
  exports.chars = {};
  exports.chars.wide = new RegExp("([" + "\\u1100-\\u115f" + "\\u2329\\u232a" + "\\u2e80-\\u303e\\u3040-\\ua4cf" + "\\uac00-\\ud7a3" + "\\uf900-\\ufaff" + "\\ufe10-\\ufe19" + "\\ufe30-\\ufe6f" + "\\uff00-\\uff60" + "\\uffe0-\\uffe6" + "])", "g");
  exports.chars.swide = new RegExp("(" + "[\\ud840-\\ud87f][\\udc00-\\udffd]" + "|" + "[\\ud880-\\ud8bf][\\udc00-\\udffd]" + ")", "g");
  exports.chars.all = new RegExp("(" + exports.chars.swide.source.slice(1, -1) + "|" + exports.chars.wide.source.slice(1, -1) + ")", "g");
  exports.chars.surrogate = /[\ud800-\udbff][\udc00-\udfff]/g;
  exports.chars.combining = exports.combiningTable.reduce(function(out, row) {
    var low, high, range;
    if (row[0] > 65535) {
      low = exports.fromCodePoint(row[0]);
      low = [
        hexify(low.charCodeAt(0)),
        hexify(low.charCodeAt(1))
      ];
      high = exports.fromCodePoint(row[1]);
      high = [
        hexify(high.charCodeAt(0)),
        hexify(high.charCodeAt(1))
      ];
      range = "[\\u" + low[0] + "-" + "\\u" + high[0] + "]" + "[\\u" + low[1] + "-" + "\\u" + high[1] + "]";
      if (!~out.indexOf("|"))
        out += "]";
      out += "|" + range;
    } else {
      low = hexify(row[0]);
      high = hexify(row[1]);
      low = "\\u" + low;
      high = "\\u" + high;
      out += low + "-" + high;
    }
    return out;
  }, "[");
  exports.chars.combining = new RegExp(exports.chars.combining, "g");
  function hexify(n) {
    n = n.toString(16);
    while (n.length < 4)
      n = "0" + n;
    return n;
  }
});

// node_modules/neo-blessed/lib/events.js
var require_events = __commonJS((exports, module) => {
  var slice = Array.prototype.slice;
  function EventEmitter() {
    if (!this._events)
      this._events = {};
  }
  EventEmitter.prototype.setMaxListeners = function(n) {
    this._maxListeners = n;
  };
  EventEmitter.prototype.addListener = function(type, listener) {
    if (!this._events[type]) {
      this._events[type] = listener;
    } else if (typeof this._events[type] === "function") {
      this._events[type] = [this._events[type], listener];
    } else {
      this._events[type].push(listener);
    }
    this._emit("newListener", [type, listener]);
  };
  EventEmitter.prototype.on = EventEmitter.prototype.addListener;
  EventEmitter.prototype.removeListener = function(type, listener) {
    var handler = this._events[type];
    if (!handler)
      return;
    if (typeof handler === "function" || handler.length === 1) {
      delete this._events[type];
      this._emit("removeListener", [type, listener]);
      return;
    }
    for (var i = 0;i < handler.length; i++) {
      if (handler[i] === listener || handler[i].listener === listener) {
        handler.splice(i, 1);
        this._emit("removeListener", [type, listener]);
        return;
      }
    }
  };
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
  EventEmitter.prototype.removeAllListeners = function(type) {
    if (type) {
      delete this._events[type];
    } else {
      this._events = {};
    }
  };
  EventEmitter.prototype.once = function(type, listener) {
    function on() {
      this.removeListener(type, on);
      return listener.apply(this, arguments);
    }
    on.listener = listener;
    return this.on(type, on);
  };
  EventEmitter.prototype.listeners = function(type) {
    return typeof this._events[type] === "function" ? [this._events[type]] : this._events[type] || [];
  };
  EventEmitter.prototype._emit = function(type, args) {
    var handler = this._events[type], ret;
    if (!handler) {
      if (type === "error") {
        throw new args[0];
      }
      return;
    }
    if (typeof handler === "function") {
      return handler.apply(this, args);
    }
    for (var i = 0;i < handler.length; i++) {
      if (handler[i].apply(this, args) === false) {
        ret = false;
      }
    }
    return ret !== false;
  };
  EventEmitter.prototype.emit = function(type) {
    var args = slice.call(arguments, 1), params = slice.call(arguments), el = this;
    this._emit("event", params);
    if (this.type === "screen") {
      return this._emit(type, args);
    }
    if (this._emit(type, args) === false) {
      return false;
    }
    type = "element " + type;
    args.unshift(this);
    do {
      if (!el._events[type])
        continue;
      if (el._emit(type, args) === false) {
        return false;
      }
    } while (el = el.parent);
    return true;
  };
  exports = EventEmitter;
  exports.EventEmitter = EventEmitter;
  module.exports = exports;
});

// node_modules/neo-blessed/lib/widgets/node.js
var require_node = __commonJS((exports, module) => {
  var EventEmitter = require_events().EventEmitter;
  function Node(options) {
    var self = this;
    var Screen = require_screen();
    if (!(this instanceof Node)) {
      return new Node(options);
    }
    EventEmitter.call(this);
    options = options || {};
    this.options = options;
    this.screen = this.screen || options.screen;
    if (!this.screen) {
      if (this.type === "screen") {
        this.screen = this;
      } else if (Screen.total === 1) {
        this.screen = Screen.global;
      } else if (options.parent) {
        this.screen = options.parent;
        while (this.screen && this.screen.type !== "screen") {
          this.screen = this.screen.parent;
        }
      } else if (Screen.total) {
        this.screen = Screen.instances[Screen.instances.length - 1];
        process.nextTick(function() {
          if (!self.parent) {
            throw new Error("Element (" + self.type + ")" + " was not appended synchronously after the" + " screen's creation. Please set a `parent`" + " or `screen` option in the element's constructor" + " if you are going to use multiple screens and" + " append the element later.");
          }
        });
      } else {
        throw new Error("No active screen.");
      }
    }
    this.parent = options.parent || null;
    this.children = [];
    this.$ = this._ = this.data = {};
    this.uid = Node.uid++;
    this.index = this.index != null ? this.index : -1;
    if (this.type !== "screen") {
      this.detached = true;
    }
    if (this.parent) {
      this.parent.append(this);
    }
    (options.children || []).forEach(this.append.bind(this));
  }
  Node.uid = 0;
  Node.prototype.__proto__ = EventEmitter.prototype;
  Node.prototype.type = "node";
  Node.prototype.insert = function(element, i) {
    var self = this;
    if (element.screen && element.screen !== this.screen) {
      throw new Error("Cannot switch a node's screen.");
    }
    element.detach();
    element.parent = this;
    element.screen = this.screen;
    if (i === 0) {
      this.children.unshift(element);
    } else if (i === this.children.length) {
      this.children.push(element);
    } else {
      this.children.splice(i, 0, element);
    }
    element.emit("reparent", this);
    this.emit("adopt", element);
    (function emit(el) {
      var n = el.detached !== self.detached;
      el.detached = self.detached;
      if (n)
        el.emit("attach");
      el.children.forEach(emit);
    })(element);
    if (!this.screen.focused) {
      this.screen.focused = element;
    }
  };
  Node.prototype.prepend = function(element) {
    this.insert(element, 0);
  };
  Node.prototype.append = function(element) {
    this.insert(element, this.children.length);
  };
  Node.prototype.insertBefore = function(element, other) {
    var i = this.children.indexOf(other);
    if (~i)
      this.insert(element, i);
  };
  Node.prototype.insertAfter = function(element, other) {
    var i = this.children.indexOf(other);
    if (~i)
      this.insert(element, i + 1);
  };
  Node.prototype.remove = function(element) {
    if (element.parent !== this)
      return;
    var i = this.children.indexOf(element);
    if (!~i)
      return;
    element.clearPos();
    element.parent = null;
    this.children.splice(i, 1);
    i = this.screen.clickable.indexOf(element);
    if (~i)
      this.screen.clickable.splice(i, 1);
    i = this.screen.keyable.indexOf(element);
    if (~i)
      this.screen.keyable.splice(i, 1);
    element.emit("reparent", null);
    this.emit("remove", element);
    (function emit(el) {
      var n = el.detached !== true;
      el.detached = true;
      if (n)
        el.emit("detach");
      el.children.forEach(emit);
    })(element);
    if (this.screen.focused === element) {
      this.screen.rewindFocus();
    }
  };
  Node.prototype.detach = function() {
    if (this.parent)
      this.parent.remove(this);
  };
  Node.prototype.free = function() {
    return;
  };
  Node.prototype.destroy = function() {
    this.detach();
    this.forDescendants(function(el) {
      el.free();
      el.destroyed = true;
      el.emit("destroy");
    }, this);
  };
  Node.prototype.forDescendants = function(iter, s) {
    if (s)
      iter(this);
    this.children.forEach(function emit(el) {
      iter(el);
      el.children.forEach(emit);
    });
  };
  Node.prototype.forAncestors = function(iter, s) {
    var el = this;
    if (s)
      iter(this);
    while (el = el.parent) {
      iter(el);
    }
  };
  Node.prototype.collectDescendants = function(s) {
    var out = [];
    this.forDescendants(function(el) {
      out.push(el);
    }, s);
    return out;
  };
  Node.prototype.collectAncestors = function(s) {
    var out = [];
    this.forAncestors(function(el) {
      out.push(el);
    }, s);
    return out;
  };
  Node.prototype.emitDescendants = function() {
    var args = Array.prototype.slice(arguments), iter;
    if (typeof args[args.length - 1] === "function") {
      iter = args.pop();
    }
    return this.forDescendants(function(el) {
      if (iter)
        iter(el);
      el.emit.apply(el, args);
    }, true);
  };
  Node.prototype.emitAncestors = function() {
    var args = Array.prototype.slice(arguments), iter;
    if (typeof args[args.length - 1] === "function") {
      iter = args.pop();
    }
    return this.forAncestors(function(el) {
      if (iter)
        iter(el);
      el.emit.apply(el, args);
    }, true);
  };
  Node.prototype.hasDescendant = function(target) {
    return function find(el) {
      for (var i = 0;i < el.children.length; i++) {
        if (el.children[i] === target) {
          return true;
        }
        if (find(el.children[i]) === true) {
          return true;
        }
      }
      return false;
    }(this);
  };
  Node.prototype.hasAncestor = function(target) {
    var el = this;
    while (el = el.parent) {
      if (el === target)
        return true;
    }
    return false;
  };
  Node.prototype.get = function(name, value) {
    if (this.data.hasOwnProperty(name)) {
      return this.data[name];
    }
    return value;
  };
  Node.prototype.set = function(name, value) {
    return this.data[name] = value;
  };
  module.exports = Node;
});

// node_modules/neo-blessed/lib/widgets/element.js
var require_element = __commonJS((exports, module) => {
  var assert = __require("assert");
  var colors = require_colors();
  var unicode = require_unicode();
  var nextTick = global.setImmediate || process.nextTick.bind(process);
  var helpers = require_helpers();
  var Node = require_node();
  function Element(options) {
    var self = this;
    if (!(this instanceof Node)) {
      return new Element(options);
    }
    options = options || {};
    if (options.scrollable && !this._ignore && this.type !== "scrollable-box") {
      var ScrollableBox = require_scrollablebox();
      Object.getOwnPropertyNames(ScrollableBox.prototype).forEach(function(key) {
        if (key === "type")
          return;
        Object.defineProperty(this, key, Object.getOwnPropertyDescriptor(ScrollableBox.prototype, key));
      }, this);
      this._ignore = true;
      ScrollableBox.call(this, options);
      delete this._ignore;
      return this;
    }
    Node.call(this, options);
    this.name = options.name;
    options.position = options.position || {
      left: options.left,
      right: options.right,
      top: options.top,
      bottom: options.bottom,
      width: options.width,
      height: options.height
    };
    if (options.position.width === "shrink" || options.position.height === "shrink") {
      if (options.position.width === "shrink") {
        delete options.position.width;
      }
      if (options.position.height === "shrink") {
        delete options.position.height;
      }
      options.shrink = true;
    }
    this.position = options.position;
    this.noOverflow = options.noOverflow;
    this.dockBorders = options.dockBorders;
    this.shadow = options.shadow;
    this.style = options.style;
    if (!this.style) {
      this.style = {};
      this.style.fg = options.fg;
      this.style.bg = options.bg;
      this.style.bold = options.bold;
      this.style.underline = options.underline;
      this.style.blink = options.blink;
      this.style.inverse = options.inverse;
      this.style.invisible = options.invisible;
      this.style.transparent = options.transparent;
    }
    this.hidden = options.hidden || false;
    this.fixed = options.fixed || false;
    this.align = options.align || "left";
    this.valign = options.valign || "top";
    this.wrap = options.wrap !== false;
    this.shrink = options.shrink;
    this.fixed = options.fixed;
    this.ch = options.ch || " ";
    if (typeof options.padding === "number" || !options.padding) {
      options.padding = {
        left: options.padding,
        top: options.padding,
        right: options.padding,
        bottom: options.padding
      };
    }
    this.padding = {
      left: options.padding.left || 0,
      top: options.padding.top || 0,
      right: options.padding.right || 0,
      bottom: options.padding.bottom || 0
    };
    this.border = options.border;
    if (this.border) {
      if (typeof this.border === "string") {
        this.border = { type: this.border };
      }
      this.border.type = this.border.type || "bg";
      if (this.border.type === "ascii")
        this.border.type = "line";
      this.border.ch = this.border.ch || " ";
      this.style.border = this.style.border || this.border.style;
      if (!this.style.border) {
        this.style.border = {};
        this.style.border.fg = this.border.fg;
        this.style.border.bg = this.border.bg;
      }
      if (this.border.left == null)
        this.border.left = true;
      if (this.border.top == null)
        this.border.top = true;
      if (this.border.right == null)
        this.border.right = true;
      if (this.border.bottom == null)
        this.border.bottom = true;
    }
    if (options.clickable) {
      this.screen._listenMouse(this);
    }
    if (options.input || options.keyable) {
      this.screen._listenKeys(this);
    }
    this.parseTags = options.parseTags || options.tags;
    this.setContent(options.content || "", true);
    if (options.label) {
      this.setLabel(options.label);
    }
    if (options.hoverText) {
      this.setHover(options.hoverText);
    }
    this.on("newListener", function fn(type) {
      if (type === "mouse" || type === "click" || type === "mouseover" || type === "mouseout" || type === "mousedown" || type === "mouseup" || type === "mousewheel" || type === "wheeldown" || type === "wheelup" || type === "mousemove") {
        self.screen._listenMouse(self);
      } else if (type === "keypress" || type.indexOf("key ") === 0) {
        self.screen._listenKeys(self);
      }
    });
    this.on("resize", function() {
      self.parseContent();
    });
    this.on("attach", function() {
      self.parseContent();
    });
    this.on("detach", function() {
      delete self.lpos;
    });
    if (options.hoverBg != null) {
      options.hoverEffects = options.hoverEffects || {};
      options.hoverEffects.bg = options.hoverBg;
    }
    if (this.style.hover) {
      options.hoverEffects = this.style.hover;
    }
    if (this.style.focus) {
      options.focusEffects = this.style.focus;
    }
    if (options.effects) {
      if (options.effects.hover)
        options.hoverEffects = options.effects.hover;
      if (options.effects.focus)
        options.focusEffects = options.effects.focus;
    }
    [
      ["hoverEffects", "mouseover", "mouseout", "_htemp"],
      ["focusEffects", "focus", "blur", "_ftemp"]
    ].forEach(function(props) {
      var pname = props[0], over = props[1], out = props[2], temp = props[3];
      self.screen.setEffects(self, self, over, out, self.options[pname], temp);
    });
    if (this.options.draggable) {
      this.draggable = true;
    }
    if (options.focused) {
      this.focus();
    }
  }
  Element.prototype.__proto__ = Node.prototype;
  Element.prototype.type = "element";
  Element.prototype.__defineGetter__("focused", function() {
    return this.screen.focused === this;
  });
  Element.prototype.sattr = function(style, fg, bg) {
    var { bold, underline, blink, inverse, invisible } = style;
    if (fg == null && bg == null) {
      fg = style.fg;
      bg = style.bg;
    }
    if (typeof bold === "function")
      bold = bold(this);
    if (typeof underline === "function")
      underline = underline(this);
    if (typeof blink === "function")
      blink = blink(this);
    if (typeof inverse === "function")
      inverse = inverse(this);
    if (typeof invisible === "function")
      invisible = invisible(this);
    if (typeof fg === "function")
      fg = fg(this);
    if (typeof bg === "function")
      bg = bg(this);
    return (invisible ? 16 : 0) << 18 | (inverse ? 8 : 0) << 18 | (blink ? 4 : 0) << 18 | (underline ? 2 : 0) << 18 | (bold ? 1 : 0) << 18 | colors.convert(fg) << 9 | colors.convert(bg);
  };
  Element.prototype.onScreenEvent = function(type, handler) {
    var listeners = this._slisteners = this._slisteners || [];
    listeners.push({ type, handler });
    this.screen.on(type, handler);
  };
  Element.prototype.onceScreenEvent = function(type, handler) {
    var listeners = this._slisteners = this._slisteners || [];
    var entry = { type, handler };
    listeners.push(entry);
    this.screen.once(type, function() {
      var i = listeners.indexOf(entry);
      if (~i)
        listeners.splice(i, 1);
      return handler.apply(this, arguments);
    });
  };
  Element.prototype.removeScreenEvent = function(type, handler) {
    var listeners = this._slisteners = this._slisteners || [];
    for (var i = 0;i < listeners.length; i++) {
      var listener = listeners[i];
      if (listener.type === type && listener.handler === handler) {
        listeners.splice(i, 1);
        if (this._slisteners.length === 0) {
          delete this._slisteners;
        }
        break;
      }
    }
    this.screen.removeListener(type, handler);
  };
  Element.prototype.free = function() {
    var listeners = this._slisteners = this._slisteners || [];
    for (var i = 0;i < listeners.length; i++) {
      var listener = listeners[i];
      this.screen.removeListener(listener.type, listener.handler);
    }
    delete this._slisteners;
  };
  Element.prototype.hide = function() {
    if (this.hidden)
      return;
    this.clearPos();
    this.hidden = true;
    this.emit("hide");
    if (this.screen.focused === this) {
      this.screen.rewindFocus();
    }
  };
  Element.prototype.show = function() {
    if (!this.hidden)
      return;
    this.hidden = false;
    this.emit("show");
  };
  Element.prototype.toggle = function() {
    return this.hidden ? this.show() : this.hide();
  };
  Element.prototype.focus = function() {
    return this.screen.focused = this;
  };
  Element.prototype.setContent = function(content, noClear, noTags) {
    if (!noClear)
      this.clearPos();
    this.content = content || "";
    this.parseContent(noTags);
    this.emit("set content");
  };
  Element.prototype.getContent = function() {
    if (!this._clines)
      return "";
    return this._clines.fake.join(`
`);
  };
  Element.prototype.setText = function(content, noClear) {
    content = content || "";
    content = content.replace(/\x1b\[[\d;]*m/g, "");
    return this.setContent(content, noClear, true);
  };
  Element.prototype.getText = function() {
    return this.getContent().replace(/\x1b\[[\d;]*m/g, "");
  };
  Element.prototype.parseContent = function(noTags) {
    if (this.detached)
      return false;
    var width = this.width - this.iwidth;
    if (this._clines == null || this._clines.width !== width || this._clines.content !== this.content) {
      var content = this.content;
      content = content.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1a\x1c-\x1f\x7f]/g, "").replace(/\x1b(?!\[[\d;]*m)/g, "").replace(/\r\n|\r/g, `
`).replace(/\t/g, this.screen.tabc);
      if (this.screen.fullUnicode) {
        content = content.replace(unicode.chars.all, "$1\x03");
        if (this.screen.program.isiTerm2) {
          content = content.replace(unicode.chars.combining, "");
        }
      } else {
        content = content.replace(unicode.chars.all, "??");
        content = content.replace(unicode.chars.combining, "");
        content = content.replace(unicode.chars.surrogate, "?");
      }
      if (!noTags) {
        content = this._parseTags(content);
      }
      this._clines = this._wrapContent(content, width);
      this._clines.width = width;
      this._clines.content = this.content;
      this._clines.attr = this._parseAttr(this._clines);
      this._clines.ci = [];
      this._clines.reduce(function(total, line) {
        this._clines.ci.push(total);
        return total + line.length + 1;
      }.bind(this), 0);
      this._pcontent = this._clines.join(`
`);
      this.emit("parsed content");
      return true;
    }
    this._clines.attr = this._parseAttr(this._clines) || this._clines.attr;
    return false;
  };
  Element.prototype._parseTags = function(text) {
    if (!this.parseTags)
      return text;
    if (!/{\/?[\w\-,;!#]*}/.test(text))
      return text;
    var program = this.screen.program, out = "", state, bg = [], fg = [], flag = [], cap, slash, param, attr, esc;
    for (;; ) {
      if (!esc && (cap = /^{escape}/.exec(text))) {
        text = text.substring(cap[0].length);
        esc = true;
        continue;
      }
      if (esc && (cap = /^([\s\S]+?){\/escape}/.exec(text))) {
        text = text.substring(cap[0].length);
        out += cap[1];
        esc = false;
        continue;
      }
      if (esc) {
        out += text;
        break;
      }
      if (cap = /^{(\/?)([\w\-,;!#]*)}/.exec(text)) {
        text = text.substring(cap[0].length);
        slash = cap[1] === "/";
        param = cap[2].replace(/-/g, " ");
        if (param === "open") {
          out += "{";
          continue;
        } else if (param === "close") {
          out += "}";
          continue;
        }
        if (param.slice(-3) === " bg")
          state = bg;
        else if (param.slice(-3) === " fg")
          state = fg;
        else
          state = flag;
        if (slash) {
          if (!param) {
            out += program._attr("normal");
            bg.length = 0;
            fg.length = 0;
            flag.length = 0;
          } else {
            attr = program._attr(param, false);
            if (attr == null) {
              out += cap[0];
            } else {
              state.pop();
              if (state.length) {
                out += program._attr(state[state.length - 1]);
              } else {
                out += attr;
              }
            }
          }
        } else {
          if (!param) {
            out += cap[0];
          } else {
            attr = program._attr(param);
            if (attr == null) {
              out += cap[0];
            } else {
              state.push(param);
              out += attr;
            }
          }
        }
        continue;
      }
      if (cap = /^[\s\S]+?(?={\/?[\w\-,;!#]*})/.exec(text)) {
        text = text.substring(cap[0].length);
        out += cap[0];
        continue;
      }
      out += text;
      break;
    }
    return out;
  };
  Element.prototype._parseAttr = function(lines) {
    var dattr = this.sattr(this.style), attr = dattr, attrs = [], line, i, j, c;
    if (lines[0].attr === attr) {
      return;
    }
    for (j = 0;j < lines.length; j++) {
      line = lines[j];
      attrs[j] = attr;
      for (i = 0;i < line.length; i++) {
        if (line[i] === "\x1B") {
          if (c = /^\x1b\[[\d;]*m/.exec(line.substring(i))) {
            attr = this.screen.attrCode(c[0], attr, dattr);
            i += c[0].length - 1;
          }
        }
      }
    }
    return attrs;
  };
  Element.prototype._align = function(line, width, align) {
    if (!align)
      return line;
    var cline = line.replace(/\x1b\[[\d;]*m/g, ""), len = cline.length, s = width - len;
    if (this.shrink) {
      s = 0;
    }
    if (len === 0)
      return line;
    if (s < 0)
      return line;
    if (align === "center") {
      s = Array((s / 2 | 0) + 1).join(" ");
      return s + line + s;
    } else if (align === "right") {
      s = Array(s + 1).join(" ");
      return s + line;
    } else if (this.parseTags && ~line.indexOf("{|}")) {
      var parts = line.split("{|}");
      var cparts = cline.split("{|}");
      s = Math.max(width - cparts[0].length - cparts[1].length, 0);
      s = Array(s + 1).join(" ");
      return parts[0] + s + parts[1];
    }
    return line;
  };
  Element.prototype._wrapContent = function(content, width) {
    var tags = this.parseTags, state = this.align, wrap = this.wrap, margin = 0, rtof = [], ftor = [], out = [], no = 0, line, align, cap, total, i, part, j, lines, rest;
    lines = content.split(`
`);
    if (!content) {
      out.push(content);
      out.rtof = [0];
      out.ftor = [[0]];
      out.fake = lines;
      out.real = out;
      out.mwidth = 0;
      return out;
    }
    if (this.scrollbar)
      margin++;
    if (this.type === "textarea")
      margin++;
    if (width > margin)
      width -= margin;
    main:
      for (;no < lines.length; no++) {
        line = lines[no];
        align = state;
        ftor.push([]);
        if (tags) {
          if (cap = /^{(left|center|right)}/.exec(line)) {
            line = line.substring(cap[0].length);
            align = state = cap[1] !== "left" ? cap[1] : null;
          }
          if (cap = /{\/(left|center|right)}$/.exec(line)) {
            line = line.slice(0, -cap[0].length);
            state = this.align;
          }
        }
        while (line.length > width) {
          for (i = 0, total = 0;i < line.length; i++) {
            while (line[i] === "\x1B") {
              while (line[i] && line[i++] !== "m")
                ;
            }
            if (!line[i])
              break;
            if (++total === width) {
              i++;
              if (!wrap) {
                rest = line.substring(i).match(/\x1b\[[^m]*m/g);
                rest = rest ? rest.join("") : "";
                out.push(this._align(line.substring(0, i) + rest, width, align));
                ftor[no].push(out.length - 1);
                rtof.push(no);
                continue main;
              }
              if (!this.screen.fullUnicode) {
                if (i !== line.length) {
                  j = i;
                  while (j > i - 10 && j > 0 && line[--j] !== " ")
                    ;
                  if (line[j] === " ")
                    i = j + 1;
                }
              } else {
                if (i !== line.length) {
                  if (unicode.isSurrogate(line, i))
                    i--;
                  for (var s = 0, n = 0;n < i; n++) {
                    if (unicode.isSurrogate(line, n))
                      s++, n++;
                  }
                  i += s;
                  j = i;
                  while (j > i - 10 && j > 0) {
                    j--;
                    if (line[j] === " " || line[j] === "\x03" || unicode.isSurrogate(line, j - 1) && line[j + 1] !== "\x03" || unicode.isCombining(line, j)) {
                      break;
                    }
                  }
                  if (line[j] === " " || line[j] === "\x03" || unicode.isSurrogate(line, j - 1) && line[j + 1] !== "\x03" || unicode.isCombining(line, j)) {
                    i = j + 1;
                  }
                }
              }
              break;
            }
          }
          part = line.substring(0, i);
          line = line.substring(i);
          out.push(this._align(part, width, align));
          ftor[no].push(out.length - 1);
          rtof.push(no);
          if (line === "")
            continue main;
          if (/^(?:\x1b[\[\d;]*m)+$/.test(line)) {
            out[out.length - 1] += line;
            continue main;
          }
        }
        out.push(this._align(line, width, align));
        ftor[no].push(out.length - 1);
        rtof.push(no);
      }
    out.rtof = rtof;
    out.ftor = ftor;
    out.fake = lines;
    out.real = out;
    out.mwidth = out.reduce(function(current, line2) {
      line2 = line2.replace(/\x1b\[[\d;]*m/g, "");
      return line2.length > current ? line2.length : current;
    }, 0);
    return out;
  };
  Element.prototype.__defineGetter__("visible", function() {
    var el = this;
    do {
      if (el.detached)
        return false;
      if (el.hidden)
        return false;
    } while (el = el.parent);
    return true;
  });
  Element.prototype.__defineGetter__("_detached", function() {
    var el = this;
    do {
      if (el.type === "screen")
        return false;
      if (!el.parent)
        return true;
    } while (el = el.parent);
    return false;
  });
  Element.prototype.enableMouse = function() {
    this.screen._listenMouse(this);
  };
  Element.prototype.enableKeys = function() {
    this.screen._listenKeys(this);
  };
  Element.prototype.enableInput = function() {
    this.screen._listenMouse(this);
    this.screen._listenKeys(this);
  };
  Element.prototype.__defineGetter__("draggable", function() {
    return this._draggable === true;
  });
  Element.prototype.__defineSetter__("draggable", function(draggable) {
    return draggable ? this.enableDrag(draggable) : this.disableDrag();
  });
  Element.prototype.enableDrag = function(verify) {
    var self = this;
    if (this._draggable)
      return true;
    if (typeof verify !== "function") {
      verify = function() {
        return true;
      };
    }
    this.enableMouse();
    this.on("mousedown", this._dragMD = function(data) {
      if (self.screen._dragging)
        return;
      if (!verify(data))
        return;
      self.screen._dragging = self;
      self._drag = {
        x: data.x - self.aleft,
        y: data.y - self.atop
      };
      self.setFront();
    });
    this.onScreenEvent("mouse", this._dragM = function(data) {
      if (self.screen._dragging !== self)
        return;
      if (data.action !== "mousedown" && data.action !== "mousemove") {
        delete self.screen._dragging;
        delete self._drag;
        return;
      }
      if (!self.parent)
        return;
      var ox = self._drag.x, oy = self._drag.y, px = self.parent.aleft, py = self.parent.atop, x = data.x - px - ox, y = data.y - py - oy;
      if (self.position.right != null) {
        if (self.position.left != null) {
          self.width = "100%-" + (self.parent.width - self.width);
        }
        self.position.right = null;
      }
      if (self.position.bottom != null) {
        if (self.position.top != null) {
          self.height = "100%-" + (self.parent.height - self.height);
        }
        self.position.bottom = null;
      }
      self.rleft = x;
      self.rtop = y;
      self.screen.render();
    });
    return this._draggable = true;
  };
  Element.prototype.disableDrag = function() {
    if (!this._draggable)
      return false;
    delete this.screen._dragging;
    delete this._drag;
    this.removeListener("mousedown", this._dragMD);
    this.removeScreenEvent("mouse", this._dragM);
    return this._draggable = false;
  };
  Element.prototype.key = function() {
    return this.screen.program.key.apply(this, arguments);
  };
  Element.prototype.onceKey = function() {
    return this.screen.program.onceKey.apply(this, arguments);
  };
  Element.prototype.unkey = Element.prototype.removeKey = function() {
    return this.screen.program.unkey.apply(this, arguments);
  };
  Element.prototype.setIndex = function(index) {
    if (!this.parent)
      return;
    if (index < 0) {
      index = this.parent.children.length + index;
    }
    index = Math.max(index, 0);
    index = Math.min(index, this.parent.children.length - 1);
    var i = this.parent.children.indexOf(this);
    if (!~i)
      return;
    var item = this.parent.children.splice(i, 1)[0];
    this.parent.children.splice(index, 0, item);
  };
  Element.prototype.setFront = function() {
    return this.setIndex(-1);
  };
  Element.prototype.setBack = function() {
    return this.setIndex(0);
  };
  Element.prototype.clearPos = function(get, override) {
    if (this.detached)
      return;
    var lpos = this._getCoords(get);
    if (!lpos)
      return;
    this.screen.clearRegion(lpos.xi, lpos.xl, lpos.yi, lpos.yl, override);
  };
  Element.prototype.setLabel = function(options) {
    var self = this;
    var Box = require_box();
    if (typeof options === "string") {
      options = { text: options };
    }
    if (this._label) {
      this._label.setContent(options.text);
      if (options.side !== "right") {
        this._label.rleft = 2 + (this.border ? -1 : 0);
        this._label.position.right = undefined;
        if (!this.screen.autoPadding) {
          this._label.rleft = 2;
        }
      } else {
        this._label.rright = 2 + (this.border ? -1 : 0);
        this._label.position.left = undefined;
        if (!this.screen.autoPadding) {
          this._label.rright = 2;
        }
      }
      return;
    }
    this._label = new Box({
      screen: this.screen,
      parent: this,
      content: options.text,
      top: -this.itop,
      tags: this.parseTags,
      shrink: true,
      style: this.style.label
    });
    if (options.side !== "right") {
      this._label.rleft = 2 - this.ileft;
    } else {
      this._label.rright = 2 - this.iright;
    }
    this._label._isLabel = true;
    if (!this.screen.autoPadding) {
      if (options.side !== "right") {
        this._label.rleft = 2;
      } else {
        this._label.rright = 2;
      }
      this._label.rtop = 0;
    }
    var reposition = function() {
      self._label.rtop = (self.childBase || 0) - self.itop;
      if (!self.screen.autoPadding) {
        self._label.rtop = self.childBase || 0;
      }
      self.screen.render();
    };
    this.on("scroll", this._labelScroll = function() {
      reposition();
    });
    this.on("resize", this._labelResize = function() {
      nextTick(function() {
        reposition();
      });
    });
  };
  Element.prototype.removeLabel = function() {
    if (!this._label)
      return;
    this.removeListener("scroll", this._labelScroll);
    this.removeListener("resize", this._labelResize);
    this._label.detach();
    delete this._labelScroll;
    delete this._labelResize;
    delete this._label;
  };
  Element.prototype.setHover = function(options) {
    if (typeof options === "string") {
      options = { text: options };
    }
    this._hoverOptions = options;
    this.enableMouse();
    this.screen._initHover();
  };
  Element.prototype.removeHover = function() {
    delete this._hoverOptions;
    if (!this.screen._hoverText || this.screen._hoverText.detached)
      return;
    this.screen._hoverText.detach();
    this.screen.render();
  };
  Element.prototype._getPos = function() {
    var pos = this.lpos;
    assert.ok(pos);
    if (pos.aleft != null)
      return pos;
    pos.aleft = pos.xi;
    pos.atop = pos.yi;
    pos.aright = this.screen.cols - pos.xl;
    pos.abottom = this.screen.rows - pos.yl;
    pos.width = pos.xl - pos.xi;
    pos.height = pos.yl - pos.yi;
    return pos;
  };
  Element.prototype._getWidth = function(get) {
    var parent = get ? this.parent._getPos() : this.parent, width = this.position.width, left, expr;
    if (typeof width === "string") {
      if (width === "half")
        width = "50%";
      expr = width.split(/(?=\+|-)/);
      width = expr[0];
      width = +width.slice(0, -1) / 100;
      width = parent.width * width | 0;
      width += +(expr[1] || 0);
      return width;
    }
    if (width == null) {
      left = this.position.left || 0;
      if (typeof left === "string") {
        if (left === "center")
          left = "50%";
        expr = left.split(/(?=\+|-)/);
        left = expr[0];
        left = +left.slice(0, -1) / 100;
        left = parent.width * left | 0;
        left += +(expr[1] || 0);
      }
      width = parent.width - (this.position.right || 0) - left;
      if (this.screen.autoPadding) {
        if ((this.position.left != null || this.position.right == null) && this.position.left !== "center") {
          width -= this.parent.ileft;
        }
        width -= this.parent.iright;
      }
    }
    return width;
  };
  Element.prototype.__defineGetter__("width", function() {
    return this._getWidth(false);
  });
  Element.prototype._getHeight = function(get) {
    var parent = get ? this.parent._getPos() : this.parent, height = this.position.height, top, expr;
    if (typeof height === "string") {
      if (height === "half")
        height = "50%";
      expr = height.split(/(?=\+|-)/);
      height = expr[0];
      height = +height.slice(0, -1) / 100;
      height = parent.height * height | 0;
      height += +(expr[1] || 0);
      return height;
    }
    if (height == null) {
      top = this.position.top || 0;
      if (typeof top === "string") {
        if (top === "center")
          top = "50%";
        expr = top.split(/(?=\+|-)/);
        top = expr[0];
        top = +top.slice(0, -1) / 100;
        top = parent.height * top | 0;
        top += +(expr[1] || 0);
      }
      height = parent.height - (this.position.bottom || 0) - top;
      if (this.screen.autoPadding) {
        if ((this.position.top != null || this.position.bottom == null) && this.position.top !== "center") {
          height -= this.parent.itop;
        }
        height -= this.parent.ibottom;
      }
    }
    return height;
  };
  Element.prototype.__defineGetter__("height", function() {
    return this._getHeight(false);
  });
  Element.prototype._getLeft = function(get) {
    var parent = get ? this.parent._getPos() : this.parent, left = this.position.left || 0, expr;
    if (typeof left === "string") {
      if (left === "center")
        left = "50%";
      expr = left.split(/(?=\+|-)/);
      left = expr[0];
      left = +left.slice(0, -1) / 100;
      left = parent.width * left | 0;
      left += +(expr[1] || 0);
      if (this.position.left === "center") {
        left -= this._getWidth(get) / 2 | 0;
      }
    }
    if (this.position.left == null && this.position.right != null) {
      return this.screen.cols - this._getWidth(get) - this._getRight(get);
    }
    if (this.screen.autoPadding) {
      if ((this.position.left != null || this.position.right == null) && this.position.left !== "center") {
        left += this.parent.ileft;
      }
    }
    return (parent.aleft || 0) + left;
  };
  Element.prototype.__defineGetter__("aleft", function() {
    return this._getLeft(false);
  });
  Element.prototype._getRight = function(get) {
    var parent = get ? this.parent._getPos() : this.parent, right;
    if (this.position.right == null && this.position.left != null) {
      right = this.screen.cols - (this._getLeft(get) + this._getWidth(get));
      if (this.screen.autoPadding) {
        right += this.parent.iright;
      }
      return right;
    }
    right = (parent.aright || 0) + (this.position.right || 0);
    if (this.screen.autoPadding) {
      right += this.parent.iright;
    }
    return right;
  };
  Element.prototype.__defineGetter__("aright", function() {
    return this._getRight(false);
  });
  Element.prototype._getTop = function(get) {
    var parent = get ? this.parent._getPos() : this.parent, top = this.position.top || 0, expr;
    if (typeof top === "string") {
      if (top === "center")
        top = "50%";
      expr = top.split(/(?=\+|-)/);
      top = expr[0];
      top = +top.slice(0, -1) / 100;
      top = parent.height * top | 0;
      top += +(expr[1] || 0);
      if (this.position.top === "center") {
        top -= this._getHeight(get) / 2 | 0;
      }
    }
    if (this.position.top == null && this.position.bottom != null) {
      return this.screen.rows - this._getHeight(get) - this._getBottom(get);
    }
    if (this.screen.autoPadding) {
      if ((this.position.top != null || this.position.bottom == null) && this.position.top !== "center") {
        top += this.parent.itop;
      }
    }
    return (parent.atop || 0) + top;
  };
  Element.prototype.__defineGetter__("atop", function() {
    return this._getTop(false);
  });
  Element.prototype._getBottom = function(get) {
    var parent = get ? this.parent._getPos() : this.parent, bottom;
    if (this.position.bottom == null && this.position.top != null) {
      bottom = this.screen.rows - (this._getTop(get) + this._getHeight(get));
      if (this.screen.autoPadding) {
        bottom += this.parent.ibottom;
      }
      return bottom;
    }
    bottom = (parent.abottom || 0) + (this.position.bottom || 0);
    if (this.screen.autoPadding) {
      bottom += this.parent.ibottom;
    }
    return bottom;
  };
  Element.prototype.__defineGetter__("abottom", function() {
    return this._getBottom(false);
  });
  Element.prototype.__defineGetter__("rleft", function() {
    return this.aleft - this.parent.aleft;
  });
  Element.prototype.__defineGetter__("rright", function() {
    return this.aright - this.parent.aright;
  });
  Element.prototype.__defineGetter__("rtop", function() {
    return this.atop - this.parent.atop;
  });
  Element.prototype.__defineGetter__("rbottom", function() {
    return this.abottom - this.parent.abottom;
  });
  Element.prototype.__defineSetter__("width", function(val) {
    if (this.position.width === val)
      return;
    if (/^\d+$/.test(val))
      val = +val;
    this.emit("resize");
    this.clearPos();
    return this.position.width = val;
  });
  Element.prototype.__defineSetter__("height", function(val) {
    if (this.position.height === val)
      return;
    if (/^\d+$/.test(val))
      val = +val;
    this.emit("resize");
    this.clearPos();
    return this.position.height = val;
  });
  Element.prototype.__defineSetter__("aleft", function(val) {
    var expr;
    if (typeof val === "string") {
      if (val === "center") {
        val = this.screen.width / 2 | 0;
        val -= this.width / 2 | 0;
      } else {
        expr = val.split(/(?=\+|-)/);
        val = expr[0];
        val = +val.slice(0, -1) / 100;
        val = this.screen.width * val | 0;
        val += +(expr[1] || 0);
      }
    }
    val -= this.parent.aleft;
    if (this.position.left === val)
      return;
    this.emit("move");
    this.clearPos();
    return this.position.left = val;
  });
  Element.prototype.__defineSetter__("aright", function(val) {
    val -= this.parent.aright;
    if (this.position.right === val)
      return;
    this.emit("move");
    this.clearPos();
    return this.position.right = val;
  });
  Element.prototype.__defineSetter__("atop", function(val) {
    var expr;
    if (typeof val === "string") {
      if (val === "center") {
        val = this.screen.height / 2 | 0;
        val -= this.height / 2 | 0;
      } else {
        expr = val.split(/(?=\+|-)/);
        val = expr[0];
        val = +val.slice(0, -1) / 100;
        val = this.screen.height * val | 0;
        val += +(expr[1] || 0);
      }
    }
    val -= this.parent.atop;
    if (this.position.top === val)
      return;
    this.emit("move");
    this.clearPos();
    return this.position.top = val;
  });
  Element.prototype.__defineSetter__("abottom", function(val) {
    val -= this.parent.abottom;
    if (this.position.bottom === val)
      return;
    this.emit("move");
    this.clearPos();
    return this.position.bottom = val;
  });
  Element.prototype.__defineSetter__("rleft", function(val) {
    if (this.position.left === val)
      return;
    if (/^\d+$/.test(val))
      val = +val;
    this.emit("move");
    this.clearPos();
    return this.position.left = val;
  });
  Element.prototype.__defineSetter__("rright", function(val) {
    if (this.position.right === val)
      return;
    this.emit("move");
    this.clearPos();
    return this.position.right = val;
  });
  Element.prototype.__defineSetter__("rtop", function(val) {
    if (this.position.top === val)
      return;
    if (/^\d+$/.test(val))
      val = +val;
    this.emit("move");
    this.clearPos();
    return this.position.top = val;
  });
  Element.prototype.__defineSetter__("rbottom", function(val) {
    if (this.position.bottom === val)
      return;
    this.emit("move");
    this.clearPos();
    return this.position.bottom = val;
  });
  Element.prototype.__defineGetter__("ileft", function() {
    return (this.border ? 1 : 0) + this.padding.left;
  });
  Element.prototype.__defineGetter__("itop", function() {
    return (this.border ? 1 : 0) + this.padding.top;
  });
  Element.prototype.__defineGetter__("iright", function() {
    return (this.border ? 1 : 0) + this.padding.right;
  });
  Element.prototype.__defineGetter__("ibottom", function() {
    return (this.border ? 1 : 0) + this.padding.bottom;
  });
  Element.prototype.__defineGetter__("iwidth", function() {
    return (this.border ? 2 : 0) + this.padding.left + this.padding.right;
  });
  Element.prototype.__defineGetter__("iheight", function() {
    return (this.border ? 2 : 0) + this.padding.top + this.padding.bottom;
  });
  Element.prototype.__defineGetter__("tpadding", function() {
    return this.padding.left + this.padding.top + this.padding.right + this.padding.bottom;
  });
  Element.prototype.__defineGetter__("left", function() {
    return this.rleft;
  });
  Element.prototype.__defineGetter__("right", function() {
    return this.rright;
  });
  Element.prototype.__defineGetter__("top", function() {
    return this.rtop;
  });
  Element.prototype.__defineGetter__("bottom", function() {
    return this.rbottom;
  });
  Element.prototype.__defineSetter__("left", function(val) {
    return this.rleft = val;
  });
  Element.prototype.__defineSetter__("right", function(val) {
    return this.rright = val;
  });
  Element.prototype.__defineSetter__("top", function(val) {
    return this.rtop = val;
  });
  Element.prototype.__defineSetter__("bottom", function(val) {
    return this.rbottom = val;
  });
  Element.prototype._getShrinkBox = function(xi, xl, yi, yl, get) {
    if (!this.children.length) {
      return { xi, xl: xi + 1, yi, yl: yi + 1 };
    }
    var i, el, ret, mxi = xi, mxl = xi + 1, myi = yi, myl = yi + 1;
    var _lpos;
    if (get) {
      _lpos = this.lpos;
      this.lpos = { xi, xl, yi, yl };
    }
    for (i = 0;i < this.children.length; i++) {
      el = this.children[i];
      ret = el._getCoords(get);
      if (!ret)
        continue;
      if (el.position.left == null && el.position.right != null) {
        ret.xl = xi + (ret.xl - ret.xi);
        ret.xi = xi;
        if (this.screen.autoPadding) {
          ret.xl += this.ileft;
          ret.xi += this.ileft;
        }
      }
      if (el.position.top == null && el.position.bottom != null) {
        ret.yl = yi + (ret.yl - ret.yi);
        ret.yi = yi;
        if (this.screen.autoPadding) {
          ret.yl += this.itop;
          ret.yi += this.itop;
        }
      }
      if (ret.xi < mxi)
        mxi = ret.xi;
      if (ret.xl > mxl)
        mxl = ret.xl;
      if (ret.yi < myi)
        myi = ret.yi;
      if (ret.yl > myl)
        myl = ret.yl;
    }
    if (get) {
      this.lpos = _lpos;
    }
    if (this.position.width == null && (this.position.left == null || this.position.right == null)) {
      if (this.position.left == null && this.position.right != null) {
        xi = xl - (mxl - mxi);
        if (!this.screen.autoPadding) {
          xi -= this.padding.left + this.padding.right;
        } else {
          xi -= this.ileft;
        }
      } else {
        xl = mxl;
        if (!this.screen.autoPadding) {
          xl += this.padding.left + this.padding.right;
          if (this.type === "list-table") {
            xl -= this.padding.left + this.padding.right;
            xl += this.iright;
          }
        } else {
          xl += this.iright;
        }
      }
    }
    if (this.position.height == null && (this.position.top == null || this.position.bottom == null) && (!this.scrollable || this._isList)) {
      if (this._isList) {
        myi = 0 - this.itop;
        myl = this.items.length + this.ibottom;
      }
      if (this.position.top == null && this.position.bottom != null) {
        yi = yl - (myl - myi);
        if (!this.screen.autoPadding) {
          yi -= this.padding.top + this.padding.bottom;
        } else {
          yi -= this.itop;
        }
      } else {
        yl = myl;
        if (!this.screen.autoPadding) {
          yl += this.padding.top + this.padding.bottom;
        } else {
          yl += this.ibottom;
        }
      }
    }
    return { xi, xl, yi, yl };
  };
  Element.prototype._getShrinkContent = function(xi, xl, yi, yl) {
    var h = this._clines.length, w = this._clines.mwidth || 1;
    if (this.position.width == null && (this.position.left == null || this.position.right == null)) {
      if (this.position.left == null && this.position.right != null) {
        xi = xl - w - this.iwidth;
      } else {
        xl = xi + w + this.iwidth;
      }
    }
    if (this.position.height == null && (this.position.top == null || this.position.bottom == null) && (!this.scrollable || this._isList)) {
      if (this.position.top == null && this.position.bottom != null) {
        yi = yl - h - this.iheight;
      } else {
        yl = yi + h + this.iheight;
      }
    }
    return { xi, xl, yi, yl };
  };
  Element.prototype._getShrink = function(xi, xl, yi, yl, get) {
    var shrinkBox = this._getShrinkBox(xi, xl, yi, yl, get), shrinkContent = this._getShrinkContent(xi, xl, yi, yl, get), xll = xl, yll = yl;
    if (shrinkBox.xl - shrinkBox.xi > shrinkContent.xl - shrinkContent.xi) {
      xi = shrinkBox.xi;
      xl = shrinkBox.xl;
    } else {
      xi = shrinkContent.xi;
      xl = shrinkContent.xl;
    }
    if (shrinkBox.yl - shrinkBox.yi > shrinkContent.yl - shrinkContent.yi) {
      yi = shrinkBox.yi;
      yl = shrinkBox.yl;
    } else {
      yi = shrinkContent.yi;
      yl = shrinkContent.yl;
    }
    if (xl < xll && this.position.left === "center") {
      xll = (xll - xl) / 2 | 0;
      xi += xll;
      xl += xll;
    }
    if (yl < yll && this.position.top === "center") {
      yll = (yll - yl) / 2 | 0;
      yi += yll;
      yl += yll;
    }
    return { xi, xl, yi, yl };
  };
  Element.prototype._getCoords = function(get, noscroll) {
    if (this.hidden)
      return;
    var xi = this._getLeft(get), xl = xi + this._getWidth(get), yi = this._getTop(get), yl = yi + this._getHeight(get), base = this.childBase || 0, el = this, fixed = this.fixed, coords, v, noleft, noright, notop, nobot, ppos, b;
    if (this.shrink) {
      coords = this._getShrink(xi, xl, yi, yl, get);
      xi = coords.xi, xl = coords.xl;
      yi = coords.yi, yl = coords.yl;
    }
    while (el = el.parent) {
      if (el.scrollable) {
        if (fixed) {
          fixed = false;
          continue;
        }
        break;
      }
    }
    var thisparent = el;
    if (el && !noscroll) {
      ppos = thisparent.lpos;
      if (!ppos)
        return;
      yi -= ppos.base;
      yl -= ppos.base;
      b = thisparent.border ? 1 : 0;
      if (this._isLabel) {
        b = 0;
      }
      if (yi < ppos.yi + b) {
        if (yl - 1 < ppos.yi + b) {
          return;
        } else {
          notop = true;
          v = ppos.yi - yi;
          if (this.border)
            v--;
          if (thisparent.border)
            v++;
          base += v;
          yi += v;
        }
      } else if (yl > ppos.yl - b) {
        if (yi > ppos.yl - 1 - b) {
          return;
        } else {
          nobot = true;
          v = yl - ppos.yl;
          if (this.border)
            v--;
          if (thisparent.border)
            v++;
          yl -= v;
        }
      }
      if (yi >= yl)
        return;
      if (xi < el.lpos.xi) {
        xi = el.lpos.xi;
        noleft = true;
        if (this.border)
          xi--;
        if (thisparent.border)
          xi++;
      }
      if (xl > el.lpos.xl) {
        xl = el.lpos.xl;
        noright = true;
        if (this.border)
          xl++;
        if (thisparent.border)
          xl--;
      }
      if (xi >= xl)
        return;
    }
    if (this.noOverflow && this.parent.lpos) {
      if (xi < this.parent.lpos.xi + this.parent.ileft) {
        xi = this.parent.lpos.xi + this.parent.ileft;
      }
      if (xl > this.parent.lpos.xl - this.parent.iright) {
        xl = this.parent.lpos.xl - this.parent.iright;
      }
      if (yi < this.parent.lpos.yi + this.parent.itop) {
        yi = this.parent.lpos.yi + this.parent.itop;
      }
      if (yl > this.parent.lpos.yl - this.parent.ibottom) {
        yl = this.parent.lpos.yl - this.parent.ibottom;
      }
    }
    return {
      xi,
      xl,
      yi,
      yl,
      base,
      noleft,
      noright,
      notop,
      nobot,
      renders: this.screen.renders
    };
  };
  Element.prototype.render = function() {
    this._emit("prerender");
    this.parseContent();
    var coords = this._getCoords(true);
    if (!coords) {
      delete this.lpos;
      return;
    }
    if (coords.xl - coords.xi <= 0) {
      coords.xl = Math.max(coords.xl, coords.xi);
      return;
    }
    if (coords.yl - coords.yi <= 0) {
      coords.yl = Math.max(coords.yl, coords.yi);
      return;
    }
    var lines = this.screen.lines, xi = coords.xi, xl = coords.xl, yi = coords.yi, yl = coords.yl, x, y, cell, attr, ch, content = this._pcontent, ci = this._clines.ci[coords.base], battr, dattr, c, visible, i, bch = this.ch;
    if (coords.base >= this._clines.ci.length) {
      ci = this._pcontent.length;
    }
    this.lpos = coords;
    if (this.border && this.border.type === "line") {
      this.screen._borderStops[coords.yi] = true;
      this.screen._borderStops[coords.yl - 1] = true;
    }
    dattr = this.sattr(this.style);
    attr = dattr;
    if (ci > 0) {
      attr = this._clines.attr[Math.min(coords.base, this._clines.length - 1)];
    }
    if (this.border)
      xi++, xl--, yi++, yl--;
    if (this.tpadding || this.valign && this.valign !== "top") {
      if (this.style.transparent) {
        for (y = Math.max(yi, 0);y < yl; y++) {
          if (!lines[y])
            break;
          for (x = Math.max(xi, 0);x < xl; x++) {
            if (!lines[y][x])
              break;
            lines[y][x][0] = colors.blend(attr, lines[y][x][0]);
            lines[y].dirty = true;
          }
        }
      } else {
        this.screen.fillRegion(dattr, bch, xi, xl, yi, yl);
      }
    }
    if (this.tpadding) {
      xi += this.padding.left, xl -= this.padding.right;
      yi += this.padding.top, yl -= this.padding.bottom;
    }
    if (this.valign === "middle" || this.valign === "bottom") {
      visible = yl - yi;
      if (this._clines.length < visible) {
        if (this.valign === "middle") {
          visible = visible / 2 | 0;
          visible -= this._clines.length / 2 | 0;
        } else if (this.valign === "bottom") {
          visible -= this._clines.length;
        }
        ci -= visible * (xl - xi);
      }
    }
    for (y = yi;y < yl; y++) {
      if (!lines[y]) {
        if (y >= this.screen.height || yl < this.ibottom) {
          break;
        } else {
          continue;
        }
      }
      for (x = xi;x < xl; x++) {
        cell = lines[y][x];
        if (!cell) {
          if (x >= this.screen.width || xl < this.iright) {
            break;
          } else {
            continue;
          }
        }
        ch = content[ci++] || bch;
        while (ch === "\x1B") {
          if (c = /^\x1b\[[\d;]*m/.exec(content.substring(ci - 1))) {
            ci += c[0].length - 1;
            attr = this.screen.attrCode(c[0], attr, dattr);
            if (this.parent._isList && this.parent.interactive && this.parent.items[this.parent.selected] === this && this.parent.options.invertSelected !== false) {
              attr = attr & ~(511 << 9) | dattr & 511 << 9;
            }
            ch = content[ci] || bch;
            ci++;
          } else {
            break;
          }
        }
        if (ch === "\t")
          ch = bch;
        if (ch === `
`) {
          if (x === xi && y !== yi && content[ci - 2] !== `
`) {
            x--;
            continue;
          }
          ch = bch;
          for (;x < xl; x++) {
            cell = lines[y][x];
            if (!cell)
              break;
            if (this.style.transparent) {
              lines[y][x][0] = colors.blend(attr, lines[y][x][0]);
              if (content[ci])
                lines[y][x][1] = ch;
              lines[y].dirty = true;
            } else {
              if (attr !== cell[0] || ch !== cell[1]) {
                lines[y][x][0] = attr;
                lines[y][x][1] = ch;
                lines[y].dirty = true;
              }
            }
          }
          continue;
        }
        if (this.screen.fullUnicode && content[ci - 1]) {
          var point = unicode.codePointAt(content, ci - 1);
          if (unicode.combining[point]) {
            if (point > 65535) {
              ch = content[ci - 1] + content[ci];
              ci++;
            }
            if (x - 1 >= xi) {
              lines[y][x - 1][1] += ch;
            } else if (y - 1 >= yi) {
              lines[y - 1][xl - 1][1] += ch;
            }
            x--;
            continue;
          }
          if (point > 65535) {
            ch = content[ci - 1] + content[ci];
            ci++;
          }
        }
        if (this._noFill)
          continue;
        if (this.style.transparent) {
          lines[y][x][0] = colors.blend(attr, lines[y][x][0]);
          if (content[ci])
            lines[y][x][1] = ch;
          lines[y].dirty = true;
        } else {
          if (attr !== cell[0] || ch !== cell[1]) {
            lines[y][x][0] = attr;
            lines[y][x][1] = ch;
            lines[y].dirty = true;
          }
        }
      }
    }
    if (this.scrollbar) {
      i = Math.max(this._clines.length, this._scrollBottom());
    }
    if (coords.notop || coords.nobot)
      i = -Infinity;
    if (this.scrollbar && yl - yi < i) {
      x = xl - 1;
      if (this.scrollbar.ignoreBorder && this.border)
        x++;
      if (this.alwaysScroll) {
        y = this.childBase / (i - (yl - yi));
      } else {
        y = (this.childBase + this.childOffset) / (i - 1);
      }
      y = yi + ((yl - yi) * y | 0);
      if (y >= yl)
        y = yl - 1;
      cell = lines[y] && lines[y][x];
      if (cell) {
        if (this.track) {
          ch = this.track.ch || " ";
          attr = this.sattr(this.style.track, this.style.track.fg || this.style.fg, this.style.track.bg || this.style.bg);
          this.screen.fillRegion(attr, ch, x, x + 1, yi, yl);
        }
        ch = this.scrollbar.ch || " ";
        attr = this.sattr(this.style.scrollbar, this.style.scrollbar.fg || this.style.fg, this.style.scrollbar.bg || this.style.bg);
        if (attr !== cell[0] || ch !== cell[1]) {
          lines[y][x][0] = attr;
          lines[y][x][1] = ch;
          lines[y].dirty = true;
        }
      }
    }
    if (this.border)
      xi--, xl++, yi--, yl++;
    if (this.tpadding) {
      xi -= this.padding.left, xl += this.padding.right;
      yi -= this.padding.top, yl += this.padding.bottom;
    }
    if (this.border) {
      battr = this.sattr(this.style.border);
      y = yi;
      if (coords.notop)
        y = -1;
      for (x = xi;x < xl; x++) {
        if (!lines[y])
          break;
        if (coords.noleft && x === xi)
          continue;
        if (coords.noright && x === xl - 1)
          continue;
        cell = lines[y][x];
        if (!cell)
          continue;
        if (this.border.type === "line") {
          if (x === xi) {
            ch = "\u250C";
            if (!this.border.left) {
              if (this.border.top) {
                ch = "\u2500";
              } else {
                continue;
              }
            } else {
              if (!this.border.top) {
                ch = "\u2502";
              }
            }
          } else if (x === xl - 1) {
            ch = "\u2510";
            if (!this.border.right) {
              if (this.border.top) {
                ch = "\u2500";
              } else {
                continue;
              }
            } else {
              if (!this.border.top) {
                ch = "\u2502";
              }
            }
          } else {
            ch = "\u2500";
          }
        } else if (this.border.type === "bg") {
          ch = this.border.ch;
        }
        if (!this.border.top && x !== xi && x !== xl - 1) {
          ch = " ";
          if (dattr !== cell[0] || ch !== cell[1]) {
            lines[y][x][0] = dattr;
            lines[y][x][1] = ch;
            lines[y].dirty = true;
            continue;
          }
        }
        if (battr !== cell[0] || ch !== cell[1]) {
          lines[y][x][0] = battr;
          lines[y][x][1] = ch;
          lines[y].dirty = true;
        }
      }
      y = yi + 1;
      for (;y < yl - 1; y++) {
        if (!lines[y])
          continue;
        cell = lines[y][xi];
        if (cell) {
          if (this.border.left) {
            if (this.border.type === "line") {
              ch = "\u2502";
            } else if (this.border.type === "bg") {
              ch = this.border.ch;
            }
            if (!coords.noleft) {
              if (battr !== cell[0] || ch !== cell[1]) {
                lines[y][xi][0] = battr;
                lines[y][xi][1] = ch;
                lines[y].dirty = true;
              }
            }
          } else {
            ch = " ";
            if (dattr !== cell[0] || ch !== cell[1]) {
              lines[y][xi][0] = dattr;
              lines[y][xi][1] = ch;
              lines[y].dirty = true;
            }
          }
        }
        cell = lines[y][xl - 1];
        if (cell) {
          if (this.border.right) {
            if (this.border.type === "line") {
              ch = "\u2502";
            } else if (this.border.type === "bg") {
              ch = this.border.ch;
            }
            if (!coords.noright) {
              if (battr !== cell[0] || ch !== cell[1]) {
                lines[y][xl - 1][0] = battr;
                lines[y][xl - 1][1] = ch;
                lines[y].dirty = true;
              }
            }
          } else {
            ch = " ";
            if (dattr !== cell[0] || ch !== cell[1]) {
              lines[y][xl - 1][0] = dattr;
              lines[y][xl - 1][1] = ch;
              lines[y].dirty = true;
            }
          }
        }
      }
      y = yl - 1;
      if (coords.nobot)
        y = -1;
      for (x = xi;x < xl; x++) {
        if (!lines[y])
          break;
        if (coords.noleft && x === xi)
          continue;
        if (coords.noright && x === xl - 1)
          continue;
        cell = lines[y][x];
        if (!cell)
          continue;
        if (this.border.type === "line") {
          if (x === xi) {
            ch = "\u2514";
            if (!this.border.left) {
              if (this.border.bottom) {
                ch = "\u2500";
              } else {
                continue;
              }
            } else {
              if (!this.border.bottom) {
                ch = "\u2502";
              }
            }
          } else if (x === xl - 1) {
            ch = "\u2518";
            if (!this.border.right) {
              if (this.border.bottom) {
                ch = "\u2500";
              } else {
                continue;
              }
            } else {
              if (!this.border.bottom) {
                ch = "\u2502";
              }
            }
          } else {
            ch = "\u2500";
          }
        } else if (this.border.type === "bg") {
          ch = this.border.ch;
        }
        if (!this.border.bottom && x !== xi && x !== xl - 1) {
          ch = " ";
          if (dattr !== cell[0] || ch !== cell[1]) {
            lines[y][x][0] = dattr;
            lines[y][x][1] = ch;
            lines[y].dirty = true;
          }
          continue;
        }
        if (battr !== cell[0] || ch !== cell[1]) {
          lines[y][x][0] = battr;
          lines[y][x][1] = ch;
          lines[y].dirty = true;
        }
      }
    }
    if (this.shadow) {
      y = Math.max(yi + 1, 0);
      for (;y < yl + 1; y++) {
        if (!lines[y])
          break;
        x = xl;
        for (;x < xl + 2; x++) {
          if (!lines[y][x])
            break;
          lines[y][x][0] = colors.blend(lines[y][x][0]);
          lines[y].dirty = true;
        }
      }
      y = yl;
      for (;y < yl + 1; y++) {
        if (!lines[y])
          break;
        for (x = Math.max(xi + 1, 0);x < xl; x++) {
          if (!lines[y][x])
            break;
          lines[y][x][0] = colors.blend(lines[y][x][0]);
          lines[y].dirty = true;
        }
      }
    }
    this.children.forEach(function(el) {
      if (el.screen._ci !== -1) {
        el.index = el.screen._ci++;
      }
      el.render();
    });
    this._emit("render", [coords]);
    return coords;
  };
  Element.prototype._render = Element.prototype.render;
  Element.prototype.insertLine = function(i, line) {
    if (typeof line === "string")
      line = line.split(`
`);
    if (i !== i || i == null) {
      i = this._clines.ftor.length;
    }
    i = Math.max(i, 0);
    while (this._clines.fake.length < i) {
      this._clines.fake.push("");
      this._clines.ftor.push([this._clines.push("") - 1]);
      this._clines.rtof(this._clines.fake.length - 1);
    }
    var start = this._clines.length, diff, real;
    if (i >= this._clines.ftor.length) {
      real = this._clines.ftor[this._clines.ftor.length - 1];
      real = real[real.length - 1] + 1;
    } else {
      real = this._clines.ftor[i][0];
    }
    for (var j = 0;j < line.length; j++) {
      this._clines.fake.splice(i + j, 0, line[j]);
    }
    this.setContent(this._clines.fake.join(`
`), true);
    diff = this._clines.length - start;
    if (diff > 0) {
      var pos = this._getCoords();
      if (!pos)
        return;
      var height = pos.yl - pos.yi - this.iheight, base = this.childBase || 0, visible = real >= base && real - base < height;
      if (pos && visible && this.screen.cleanSides(this)) {
        this.screen.insertLine(diff, pos.yi + this.itop + real - base, pos.yi, pos.yl - this.ibottom - 1);
      }
    }
  };
  Element.prototype.deleteLine = function(i, n) {
    n = n || 1;
    if (i !== i || i == null) {
      i = this._clines.ftor.length - 1;
    }
    i = Math.max(i, 0);
    i = Math.min(i, this._clines.ftor.length - 1);
    var start = this._clines.length, diff, real = this._clines.ftor[i][0];
    while (n--) {
      this._clines.fake.splice(i, 1);
    }
    this.setContent(this._clines.fake.join(`
`), true);
    diff = start - this._clines.length;
    var height = 0;
    if (diff > 0) {
      var pos = this._getCoords();
      if (!pos)
        return;
      height = pos.yl - pos.yi - this.iheight;
      var base = this.childBase || 0, visible = real >= base && real - base < height;
      if (pos && visible && this.screen.cleanSides(this)) {
        this.screen.deleteLine(diff, pos.yi + this.itop + real - base, pos.yi, pos.yl - this.ibottom - 1);
      }
    }
    if (this._clines.length < height) {
      this.clearPos();
    }
  };
  Element.prototype.insertTop = function(line) {
    var fake = this._clines.rtof[this.childBase || 0];
    return this.insertLine(fake, line);
  };
  Element.prototype.insertBottom = function(line) {
    var h = (this.childBase || 0) + this.height - this.iheight, i = Math.min(h, this._clines.length), fake = this._clines.rtof[i - 1] + 1;
    return this.insertLine(fake, line);
  };
  Element.prototype.deleteTop = function(n) {
    var fake = this._clines.rtof[this.childBase || 0];
    return this.deleteLine(fake, n);
  };
  Element.prototype.deleteBottom = function(n) {
    var h = (this.childBase || 0) + this.height - 1 - this.iheight, i = Math.min(h, this._clines.length - 1), fake = this._clines.rtof[i];
    n = n || 1;
    return this.deleteLine(fake - (n - 1), n);
  };
  Element.prototype.setLine = function(i, line) {
    i = Math.max(i, 0);
    while (this._clines.fake.length < i) {
      this._clines.fake.push("");
    }
    this._clines.fake[i] = line;
    return this.setContent(this._clines.fake.join(`
`), true);
  };
  Element.prototype.setBaseLine = function(i, line) {
    var fake = this._clines.rtof[this.childBase || 0];
    return this.setLine(fake + i, line);
  };
  Element.prototype.getLine = function(i) {
    i = Math.max(i, 0);
    i = Math.min(i, this._clines.fake.length - 1);
    return this._clines.fake[i];
  };
  Element.prototype.getBaseLine = function(i) {
    var fake = this._clines.rtof[this.childBase || 0];
    return this.getLine(fake + i);
  };
  Element.prototype.clearLine = function(i) {
    i = Math.min(i, this._clines.fake.length - 1);
    return this.setLine(i, "");
  };
  Element.prototype.clearBaseLine = function(i) {
    var fake = this._clines.rtof[this.childBase || 0];
    return this.clearLine(fake + i);
  };
  Element.prototype.unshiftLine = function(line) {
    return this.insertLine(0, line);
  };
  Element.prototype.shiftLine = function(n) {
    return this.deleteLine(0, n);
  };
  Element.prototype.pushLine = function(line) {
    if (!this.content)
      return this.setLine(0, line);
    return this.insertLine(this._clines.fake.length, line);
  };
  Element.prototype.popLine = function(n) {
    return this.deleteLine(this._clines.fake.length - 1, n);
  };
  Element.prototype.getLines = function() {
    return this._clines.fake.slice();
  };
  Element.prototype.getScreenLines = function() {
    return this._clines.slice();
  };
  Element.prototype.strWidth = function(text) {
    text = this.parseTags ? helpers.stripTags(text) : text;
    return this.screen.fullUnicode ? unicode.strWidth(text) : helpers.dropUnicode(text).length;
  };
  Element.prototype.screenshot = function(xi, xl, yi, yl) {
    xi = this.lpos.xi + this.ileft + (xi || 0);
    if (xl != null) {
      xl = this.lpos.xi + this.ileft + (xl || 0);
    } else {
      xl = this.lpos.xl - this.iright;
    }
    yi = this.lpos.yi + this.itop + (yi || 0);
    if (yl != null) {
      yl = this.lpos.yi + this.itop + (yl || 0);
    } else {
      yl = this.lpos.yl - this.ibottom;
    }
    return this.screen.screenshot(xi, xl, yi, yl);
  };
  module.exports = Element;
});

// node_modules/neo-blessed/lib/widgets/box.js
var require_box = __commonJS((exports, module) => {
  var Node = require_node();
  var Element = require_element();
  function Box(options) {
    if (!(this instanceof Node)) {
      return new Box(options);
    }
    options = options || {};
    Element.call(this, options);
  }
  Box.prototype.__proto__ = Element.prototype;
  Box.prototype.type = "box";
  module.exports = Box;
});

// node_modules/neo-blessed/lib/widgets/scrollablebox.js
var require_scrollablebox = __commonJS((exports, module) => {
  var Node = require_node();
  var Box = require_box();
  function ScrollableBox(options) {
    var self = this;
    if (!(this instanceof Node)) {
      return new ScrollableBox(options);
    }
    options = options || {};
    Box.call(this, options);
    if (options.scrollable === false) {
      return this;
    }
    this.scrollable = true;
    this.childOffset = 0;
    this.childBase = 0;
    this.baseLimit = options.baseLimit || Infinity;
    this.alwaysScroll = options.alwaysScroll;
    this.scrollbar = options.scrollbar;
    if (this.scrollbar) {
      this.scrollbar.ch = this.scrollbar.ch || " ";
      this.style.scrollbar = this.style.scrollbar || this.scrollbar.style;
      if (!this.style.scrollbar) {
        this.style.scrollbar = {};
        this.style.scrollbar.fg = this.scrollbar.fg;
        this.style.scrollbar.bg = this.scrollbar.bg;
        this.style.scrollbar.bold = this.scrollbar.bold;
        this.style.scrollbar.underline = this.scrollbar.underline;
        this.style.scrollbar.inverse = this.scrollbar.inverse;
        this.style.scrollbar.invisible = this.scrollbar.invisible;
      }
      if (this.track || this.scrollbar.track) {
        this.track = this.scrollbar.track || this.track;
        this.style.track = this.style.scrollbar.track || this.style.track;
        this.track.ch = this.track.ch || " ";
        this.style.track = this.style.track || this.track.style;
        if (!this.style.track) {
          this.style.track = {};
          this.style.track.fg = this.track.fg;
          this.style.track.bg = this.track.bg;
          this.style.track.bold = this.track.bold;
          this.style.track.underline = this.track.underline;
          this.style.track.inverse = this.track.inverse;
          this.style.track.invisible = this.track.invisible;
        }
        this.track.style = this.style.track;
      }
      if (options.mouse) {
        this.on("mousedown", function(data) {
          if (self._scrollingBar) {
            delete self.screen._dragging;
            delete self._drag;
            return;
          }
          var x = data.x - self.aleft;
          var y = data.y - self.atop;
          if (x === self.width - self.iright - 1) {
            delete self.screen._dragging;
            delete self._drag;
            var perc = (y - self.itop) / (self.height - self.iheight);
            self.setScrollPerc(perc * 100 | 0);
            self.screen.render();
            var smd, smu;
            self._scrollingBar = true;
            self.onScreenEvent("mousedown", smd = function(data2) {
              var y2 = data2.y - self.atop;
              var perc2 = y2 / self.height;
              self.setScrollPerc(perc2 * 100 | 0);
              self.screen.render();
            });
            self.onScreenEvent("mouseup", smu = function() {
              self._scrollingBar = false;
              self.removeScreenEvent("mousedown", smd);
              self.removeScreenEvent("mouseup", smu);
            });
          }
        });
      }
    }
    if (options.mouse) {
      this.on("wheeldown", function() {
        self.scroll(self.height / 2 | 0 || 1);
        self.screen.render();
      });
      this.on("wheelup", function() {
        self.scroll(-(self.height / 2 | 0) || -1);
        self.screen.render();
      });
    }
    if (options.keys && !options.ignoreKeys) {
      this.on("keypress", function(ch, key) {
        if (key.name === "up" || options.vi && key.name === "k") {
          self.scroll(-1);
          self.screen.render();
          return;
        }
        if (key.name === "down" || options.vi && key.name === "j") {
          self.scroll(1);
          self.screen.render();
          return;
        }
        if (options.vi && key.name === "u" && key.ctrl) {
          self.scroll(-(self.height / 2 | 0) || -1);
          self.screen.render();
          return;
        }
        if (options.vi && key.name === "d" && key.ctrl) {
          self.scroll(self.height / 2 | 0 || 1);
          self.screen.render();
          return;
        }
        if (options.vi && key.name === "b" && key.ctrl) {
          self.scroll(-self.height || -1);
          self.screen.render();
          return;
        }
        if (options.vi && key.name === "f" && key.ctrl) {
          self.scroll(self.height || 1);
          self.screen.render();
          return;
        }
        if (options.vi && key.name === "g" && !key.shift) {
          self.scrollTo(0);
          self.screen.render();
          return;
        }
        if (options.vi && key.name === "g" && key.shift) {
          self.scrollTo(self.getScrollHeight());
          self.screen.render();
          return;
        }
      });
    }
    this.on("parsed content", function() {
      self._recalculateIndex();
    });
    self._recalculateIndex();
  }
  ScrollableBox.prototype.__proto__ = Box.prototype;
  ScrollableBox.prototype.type = "scrollable-box";
  ScrollableBox.prototype.__defineGetter__("reallyScrollable", function() {
    if (this.shrink)
      return this.scrollable;
    return this.getScrollHeight() > this.height;
  });
  ScrollableBox.prototype._scrollBottom = function() {
    if (!this.scrollable)
      return 0;
    if (this._isList) {
      return this.items ? this.items.length : 0;
    }
    if (this.lpos && this.lpos._scrollBottom) {
      return this.lpos._scrollBottom;
    }
    var bottom = this.children.reduce(function(current, el) {
      if (!el.detached) {
        var lpos = el._getCoords(false, true);
        if (lpos) {
          return Math.max(current, el.rtop + (lpos.yl - lpos.yi));
        }
      }
      return Math.max(current, el.rtop + el.height);
    }, 0);
    if (this.lpos)
      this.lpos._scrollBottom = bottom;
    return bottom;
  };
  ScrollableBox.prototype.setScroll = ScrollableBox.prototype.scrollTo = function(offset, always) {
    this.scroll(0);
    return this.scroll(offset - (this.childBase + this.childOffset), always);
  };
  ScrollableBox.prototype.getScroll = function() {
    return this.childBase + this.childOffset;
  };
  ScrollableBox.prototype.scroll = function(offset, always) {
    if (!this.scrollable)
      return;
    if (this.detached)
      return;
    var visible = this.height - this.iheight, base = this.childBase, d, p, t, b, max, emax;
    if (this.alwaysScroll || always) {
      this.childOffset = offset > 0 ? visible - 1 + offset : offset;
    } else {
      this.childOffset += offset;
    }
    if (this.childOffset > visible - 1) {
      d = this.childOffset - (visible - 1);
      this.childOffset -= d;
      this.childBase += d;
    } else if (this.childOffset < 0) {
      d = this.childOffset;
      this.childOffset += -d;
      this.childBase += d;
    }
    if (this.childBase < 0) {
      this.childBase = 0;
    } else if (this.childBase > this.baseLimit) {
      this.childBase = this.baseLimit;
    }
    if (this.childBase === base) {
      return this.emit("scroll");
    }
    this.parseContent();
    max = this._clines.length - (this.height - this.iheight);
    if (max < 0)
      max = 0;
    emax = this._scrollBottom() - (this.height - this.iheight);
    if (emax < 0)
      emax = 0;
    this.childBase = Math.min(this.childBase, Math.max(emax, max));
    if (this.childBase < 0) {
      this.childBase = 0;
    } else if (this.childBase > this.baseLimit) {
      this.childBase = this.baseLimit;
    }
    p = this.lpos;
    if (p && this.childBase !== base && this.screen.cleanSides(this)) {
      t = p.yi + this.itop;
      b = p.yl - this.ibottom - 1;
      d = this.childBase - base;
      if (d > 0 && d < visible) {
        this.screen.deleteLine(d, t, t, b);
      } else if (d < 0 && -d < visible) {
        d = -d;
        this.screen.insertLine(d, t, t, b);
      }
    }
    return this.emit("scroll");
  };
  ScrollableBox.prototype._recalculateIndex = function() {
    var max, emax;
    if (this.detached || !this.scrollable) {
      return 0;
    }
    max = this._clines.length - (this.height - this.iheight);
    if (max < 0)
      max = 0;
    emax = this._scrollBottom() - (this.height - this.iheight);
    if (emax < 0)
      emax = 0;
    this.childBase = Math.min(this.childBase, Math.max(emax, max));
    if (this.childBase < 0) {
      this.childBase = 0;
    } else if (this.childBase > this.baseLimit) {
      this.childBase = this.baseLimit;
    }
  };
  ScrollableBox.prototype.resetScroll = function() {
    if (!this.scrollable)
      return;
    this.childOffset = 0;
    this.childBase = 0;
    return this.emit("scroll");
  };
  ScrollableBox.prototype.getScrollHeight = function() {
    return Math.max(this._clines.length, this._scrollBottom());
  };
  ScrollableBox.prototype.getScrollPerc = function(s) {
    var pos = this.lpos || this._getCoords();
    if (!pos)
      return s ? -1 : 0;
    var height = pos.yl - pos.yi - this.iheight, i = this.getScrollHeight(), p;
    if (height < i) {
      if (this.alwaysScroll) {
        p = this.childBase / (i - height);
      } else {
        p = (this.childBase + this.childOffset) / (i - 1);
      }
      return p * 100;
    }
    return s ? -1 : 0;
  };
  ScrollableBox.prototype.setScrollPerc = function(i) {
    var m = Math.max(this._clines.length, this._scrollBottom());
    return this.scrollTo(i / 100 * m | 0);
  };
  module.exports = ScrollableBox;
});

// node_modules/neo-blessed/lib/widgets/scrollabletext.js
var require_scrollabletext = __commonJS((exports, module) => {
  var Node = require_node();
  var ScrollableBox = require_scrollablebox();
  function ScrollableText(options) {
    if (!(this instanceof Node)) {
      return new ScrollableText(options);
    }
    options = options || {};
    options.alwaysScroll = true;
    ScrollableBox.call(this, options);
  }
  ScrollableText.prototype.__proto__ = ScrollableBox.prototype;
  ScrollableText.prototype.type = "scrollable-text";
  module.exports = ScrollableText;
});

// node_modules/neo-blessed/lib/widgets/log.js
var require_log = __commonJS((exports, module) => {
  var util = __require("util");
  var nextTick = global.setImmediate || process.nextTick.bind(process);
  var Node = require_node();
  var ScrollableText = require_scrollabletext();
  function Log(options) {
    var self = this;
    if (!(this instanceof Node)) {
      return new Log(options);
    }
    options = options || {};
    ScrollableText.call(this, options);
    this.scrollback = options.scrollback != null ? options.scrollback : Infinity;
    this.scrollOnInput = options.scrollOnInput;
    this.on("set content", function() {
      if (!self._userScrolled || self.scrollOnInput) {
        nextTick(function() {
          self.setScrollPerc(100);
          self._userScrolled = false;
          self.screen.render();
        });
      }
    });
  }
  Log.prototype.__proto__ = ScrollableText.prototype;
  Log.prototype.type = "log";
  Log.prototype.log = Log.prototype.add = function() {
    var args = Array.prototype.slice.call(arguments);
    if (typeof args[0] === "object") {
      let output = util.inspect(args[0], { depth: 1, colors: true, maxArrayLength: 50 });
      if (output.length < 1000) {
        let output2 = util.inspect(args[0], { depth: 2, colors: true, maxArrayLength: 50 });
      }
      args[0] = output;
    }
    var text = util.format.apply(util, args);
    this.emit("log", text);
    var ret = this.pushLine(text);
    if (this._clines.fake.length > this.scrollback) {
      this.shiftLine(0, this.scrollback / 3 | 0);
    }
    return ret;
  };
  Log.prototype._scroll = Log.prototype.scroll;
  Log.prototype.scroll = function(offset, always) {
    if (offset === 0)
      return this._scroll(offset, always);
    this._userScrolled = true;
    var ret = this._scroll(offset, always);
    if (this.getScrollPerc() === 100) {
      this._userScrolled = false;
    }
    return ret;
  };
  module.exports = Log;
});

// node_modules/neo-blessed/lib/widgets/screen.js
var require_screen = __commonJS((exports, module) => {
  var path = __require("path");
  var fs = __require("fs");
  var cp = __require("child_process");
  var colors = require_colors();
  var program = require_program();
  var unicode = require_unicode();
  var nextTick = global.setImmediate || process.nextTick.bind(process);
  var helpers = require_helpers();
  var Node = require_node();
  var Log = require_log();
  var Element = require_element();
  var Box = require_box();
  function Screen(options) {
    var self = this;
    if (!(this instanceof Node)) {
      return new Screen(options);
    }
    Screen.bind(this);
    options = options || {};
    if (options.rsety && options.listen) {
      options = { program: options };
    }
    this.program = options.program;
    if (!this.program) {
      this.program = program({
        input: options.input,
        output: options.output,
        log: options.log,
        debug: options.debug,
        dump: options.dump,
        terminal: options.terminal || options.term,
        resizeTimeout: options.resizeTimeout,
        forceUnicode: options.forceUnicode,
        tput: true,
        buffer: true,
        zero: true
      });
    } else {
      this.program.setupTput();
      this.program.useBuffer = true;
      this.program.zero = true;
      this.program.options.resizeTimeout = options.resizeTimeout;
      if (options.forceUnicode != null) {
        this.program.tput.features.unicode = options.forceUnicode;
        this.program.tput.unicode = options.forceUnicode;
      }
    }
    this.tput = this.program.tput;
    Node.call(this, options);
    this.autoPadding = options.autoPadding !== false;
    this.tabc = Array((options.tabSize || 4) + 1).join(" ");
    this.dockBorders = options.dockBorders;
    this.ignoreLocked = options.ignoreLocked || [];
    this._unicode = this.tput.unicode || this.tput.numbers.U8 === 1;
    this.fullUnicode = this.options.fullUnicode && this._unicode;
    this.dattr = 0 << 18 | 511 << 9 | 511;
    this.renders = 0;
    this.position = {
      left: this.left = this.aleft = this.rleft = 0,
      right: this.right = this.aright = this.rright = 0,
      top: this.top = this.atop = this.rtop = 0,
      bottom: this.bottom = this.abottom = this.rbottom = 0,
      get height() {
        return self.height;
      },
      get width() {
        return self.width;
      }
    };
    this.ileft = 0;
    this.itop = 0;
    this.iright = 0;
    this.ibottom = 0;
    this.iheight = 0;
    this.iwidth = 0;
    this.padding = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    };
    this.hover = null;
    this.history = [];
    this.clickable = [];
    this.keyable = [];
    this.grabKeys = false;
    this.lockKeys = false;
    this.focused;
    this._buf = "";
    this._ci = -1;
    if (options.title) {
      this.title = options.title;
    }
    options.cursor = options.cursor || {
      artificial: options.artificialCursor,
      shape: options.cursorShape,
      blink: options.cursorBlink,
      color: options.cursorColor
    };
    this.cursor = {
      artificial: options.cursor.artificial || false,
      shape: options.cursor.shape || "block",
      blink: options.cursor.blink || false,
      color: options.cursor.color || null,
      _set: false,
      _state: 1,
      _hidden: true
    };
    this.program.on("resize", function() {
      self.alloc();
      self.render();
      (function emit(el) {
        el.emit("resize");
        el.children.forEach(emit);
      })(self);
    });
    this.program.on("focus", function() {
      self.emit("focus");
    });
    this.program.on("blur", function() {
      self.emit("blur");
    });
    this.program.on("warning", function(text) {
      self.emit("warning", text);
    });
    this.on("newListener", function fn(type) {
      if (type === "keypress" || type.indexOf("key ") === 0 || type === "mouse") {
        if (type === "keypress" || type.indexOf("key ") === 0)
          self._listenKeys();
        if (type === "mouse")
          self._listenMouse();
      }
      if (type === "mouse" || type === "click" || type === "mouseover" || type === "mouseout" || type === "mousedown" || type === "mouseup" || type === "mousewheel" || type === "wheeldown" || type === "wheelup" || type === "mousemove") {
        self._listenMouse();
      }
    });
    this.setMaxListeners(Infinity);
    this.enter();
    this.postEnter();
  }
  Screen.global = null;
  Screen.total = 0;
  Screen.instances = [];
  Screen.bind = function(screen) {
    if (!Screen.global) {
      Screen.global = screen;
    }
    if (!~Screen.instances.indexOf(screen)) {
      Screen.instances.push(screen);
      screen.index = Screen.total;
      Screen.total++;
    }
    if (Screen._bound)
      return;
    Screen._bound = true;
    process.on("uncaughtException", Screen._exceptionHandler = function(err) {
      if (process.listeners("uncaughtException").length > 1) {
        return;
      }
      Screen.instances.slice().forEach(function(screen2) {
        screen2.destroy();
      });
      err = err || new Error("Uncaught Exception.");
      console.error(err.stack ? err.stack + "" : err + "");
      nextTick(function() {
        process.exit(1);
      });
    });
    ["SIGTERM", "SIGINT", "SIGQUIT"].forEach(function(signal) {
      var name = "_" + signal.toLowerCase() + "Handler";
      process.on(signal, Screen[name] = function() {
        if (process.listeners(signal).length > 1) {
          return;
        }
        nextTick(function() {
          process.exit(0);
        });
      });
    });
    process.on("exit", Screen._exitHandler = function() {
      Screen.instances.slice().forEach(function(screen2) {
        screen2.destroy();
      });
    });
  };
  Screen.prototype.__proto__ = Node.prototype;
  Screen.prototype.type = "screen";
  Screen.prototype.__defineGetter__("title", function() {
    return this.program.title;
  });
  Screen.prototype.__defineSetter__("title", function(title) {
    return this.program.title = title;
  });
  Screen.prototype.__defineGetter__("terminal", function() {
    return this.program.terminal;
  });
  Screen.prototype.__defineSetter__("terminal", function(terminal) {
    this.setTerminal(terminal);
    return this.program.terminal;
  });
  Screen.prototype.setTerminal = function(terminal) {
    var entered = !!this.program.isAlt;
    if (entered) {
      this._buf = "";
      this.program._buf = "";
      this.leave();
    }
    this.program.setTerminal(terminal);
    this.tput = this.program.tput;
    if (entered) {
      this.enter();
    }
  };
  Screen.prototype.enter = function() {
    if (this.program.isAlt)
      return;
    if (!this.cursor._set) {
      if (this.options.cursor.shape) {
        this.cursorShape(this.cursor.shape, this.cursor.blink);
      }
      if (this.options.cursor.color) {
        this.cursorColor(this.cursor.color);
      }
    }
    if (process.platform === "win32") {
      try {
        cp.execSync("cls", { stdio: "ignore", timeout: 1000 });
      } catch (e) {}
    }
    this.program.alternateBuffer();
    this.program.put.keypad_xmit();
    this.program.csr(0, this.height - 1);
    this.program.hideCursor();
    this.program.cup(0, 0);
    if (this.tput.strings.ena_acs) {
      this.program._write(this.tput.enacs());
    }
    this.alloc();
  };
  Screen.prototype.leave = function() {
    if (!this.program.isAlt)
      return;
    this.program.put.keypad_local();
    if (this.program.scrollTop !== 0 || this.program.scrollBottom !== this.rows - 1) {
      this.program.csr(0, this.height - 1);
    }
    this.program.showCursor();
    this.alloc();
    if (this._listenedMouse) {
      this.program.disableMouse();
    }
    this.program.normalBuffer();
    if (this.cursor._set)
      this.cursorReset();
    this.program.flush();
    if (process.platform === "win32") {
      try {
        cp.execSync("cls", { stdio: "ignore", timeout: 1000 });
      } catch (e) {}
    }
  };
  Screen.prototype.postEnter = function() {
    var self = this;
    if (this.options.debug) {
      this.debugLog = new Log({
        screen: this,
        parent: this,
        hidden: true,
        draggable: true,
        left: "center",
        top: "center",
        width: "30%",
        height: "30%",
        border: "line",
        label: " {bold}Debug Log{/bold} ",
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollbar: {
          ch: " ",
          track: {
            bg: "yellow"
          },
          style: {
            inverse: true
          }
        }
      });
      this.debugLog.toggle = function() {
        if (self.debugLog.hidden) {
          self.saveFocus();
          self.debugLog.show();
          self.debugLog.setFront();
          self.debugLog.focus();
        } else {
          self.debugLog.hide();
          self.restoreFocus();
        }
        self.render();
      };
      this.debugLog.key(["q", "escape"], self.debugLog.toggle);
      this.key("f12", self.debugLog.toggle);
    }
    if (this.options.warnings) {
      this.on("warning", function(text) {
        var warning = new Box({
          screen: self,
          parent: self,
          left: "center",
          top: "center",
          width: "shrink",
          padding: 1,
          height: "shrink",
          align: "center",
          valign: "middle",
          border: "line",
          label: " {red-fg}{bold}WARNING{/} ",
          content: "{bold}" + text + "{/bold}",
          tags: true
        });
        self.render();
        var timeout = setTimeout(function() {
          warning.destroy();
          self.render();
        }, 1500);
        if (timeout.unref) {
          timeout.unref();
        }
      });
    }
  };
  Screen.prototype._destroy = Screen.prototype.destroy;
  Screen.prototype.destroy = function() {
    this.leave();
    var index = Screen.instances.indexOf(this);
    if (~index) {
      Screen.instances.splice(index, 1);
      Screen.total--;
      Screen.global = Screen.instances[0];
      if (Screen.total === 0) {
        Screen.global = null;
        process.removeListener("uncaughtException", Screen._exceptionHandler);
        process.removeListener("SIGTERM", Screen._sigtermHandler);
        process.removeListener("SIGINT", Screen._sigintHandler);
        process.removeListener("SIGQUIT", Screen._sigquitHandler);
        process.removeListener("exit", Screen._exitHandler);
        delete Screen._exceptionHandler;
        delete Screen._sigtermHandler;
        delete Screen._sigintHandler;
        delete Screen._sigquitHandler;
        delete Screen._exitHandler;
        delete Screen._bound;
      }
      this.destroyed = true;
      this.emit("destroy");
      this._destroy();
    }
    this.program.destroy();
  };
  Screen.prototype.log = function() {
    return this.program.log.apply(this.program, arguments);
  };
  Screen.prototype.debug = function() {
    if (this.debugLog) {
      this.debugLog.log.apply(this.debugLog, arguments);
    }
    return this.program.debug.apply(this.program, arguments);
  };
  Screen.prototype._listenMouse = function(el) {
    var self = this;
    if (el && !~this.clickable.indexOf(el)) {
      el.clickable = true;
      this.clickable.push(el);
    }
    if (this._listenedMouse)
      return;
    this._listenedMouse = true;
    this.program.enableMouse();
    if (this.options.sendFocus) {
      this.program.setMouse({ sendFocus: true }, true);
    }
    this.on("render", function() {
      self._needsClickableSort = true;
    });
    this.program.on("mouse", function(data) {
      if (self.lockKeys)
        return;
      if (self._needsClickableSort) {
        self.clickable = helpers.hsort(self.clickable);
        self._needsClickableSort = false;
      }
      var i = 0, el2, set, pos;
      for (;i < self.clickable.length; i++) {
        el2 = self.clickable[i];
        if (el2.detached || !el2.visible) {
          continue;
        }
        pos = el2.lpos;
        if (!pos)
          continue;
        if (data.x >= pos.xi && data.x < pos.xl && data.y >= pos.yi && data.y < pos.yl) {
          el2.emit("mouse", data);
          if (data.action === "mousedown") {
            self.mouseDown = el2;
          } else if (data.action === "mouseup") {
            (self.mouseDown || el2).emit("click", data);
            self.mouseDown = null;
          } else if (data.action === "mousemove") {
            if (self.hover && el2.index > self.hover.index) {
              set = false;
            }
            if (self.hover !== el2 && !set) {
              if (self.hover) {
                self.hover.emit("mouseout", data);
              }
              el2.emit("mouseover", data);
              self.hover = el2;
            }
            set = true;
          }
          el2.emit(data.action, data);
          break;
        }
      }
      if ((data.action === "mousemove" || data.action === "mousedown" || data.action === "mouseup") && self.hover && !set) {
        self.hover.emit("mouseout", data);
        self.hover = null;
      }
      self.emit("mouse", data);
      self.emit(data.action, data);
    });
    this.on("element click", function(el2) {
      if (el2.clickable === true && el2.options.autoFocus !== false) {
        el2.focus();
      }
    });
  };
  Screen.prototype.enableMouse = function(el) {
    this._listenMouse(el);
  };
  Screen.prototype._listenKeys = function(el) {
    var self = this;
    if (el && !~this.keyable.indexOf(el)) {
      el.keyable = true;
      this.keyable.push(el);
    }
    if (this._listenedKeys)
      return;
    this._listenedKeys = true;
    this.program.on("keypress", function(ch, key) {
      if (self.lockKeys && !~self.ignoreLocked.indexOf(key.full)) {
        return;
      }
      var { focused, grabKeys } = self;
      if (!grabKeys || ~self.ignoreLocked.indexOf(key.full)) {
        self.emit("keypress", ch, key);
        self.emit("key " + key.full, ch, key);
      }
      if (self.grabKeys !== grabKeys || self.lockKeys) {
        return;
      }
      if (focused && focused.keyable) {
        focused.emit("keypress", ch, key);
        focused.emit("key " + key.full, ch, key);
      }
    });
  };
  Screen.prototype.enableKeys = function(el) {
    this._listenKeys(el);
  };
  Screen.prototype.enableInput = function(el) {
    this._listenMouse(el);
    this._listenKeys(el);
  };
  Screen.prototype._initHover = function() {
    var self = this;
    if (this._hoverText) {
      return;
    }
    this._hoverText = new Box({
      screen: this,
      left: 0,
      top: 0,
      tags: false,
      height: "shrink",
      width: "shrink",
      border: "line",
      style: {
        border: {
          fg: "default"
        },
        bg: "default",
        fg: "default"
      }
    });
    this.on("mousemove", function(data) {
      if (self._hoverText.detached)
        return;
      self._hoverText.rleft = data.x + 1;
      self._hoverText.rtop = data.y;
      self.render();
    });
    this.on("element mouseover", function(el, data) {
      if (!el._hoverOptions)
        return;
      self._hoverText.parseTags = el.parseTags;
      self._hoverText.setContent(el._hoverOptions.text);
      self.append(self._hoverText);
      self._hoverText.rleft = data.x + 1;
      self._hoverText.rtop = data.y;
      self.render();
    });
    this.on("element mouseout", function() {
      if (self._hoverText.detached)
        return;
      self._hoverText.detach();
      self.render();
    });
    this.on("element mouseup", function(el) {
      if (!self._hoverText.getContent())
        return;
      if (!el._hoverOptions)
        return;
      self.append(self._hoverText);
      self.render();
    });
  };
  Screen.prototype.__defineGetter__("cols", function() {
    return this.program.cols;
  });
  Screen.prototype.__defineGetter__("rows", function() {
    return this.program.rows;
  });
  Screen.prototype.__defineGetter__("width", function() {
    return this.program.cols;
  });
  Screen.prototype.__defineGetter__("height", function() {
    return this.program.rows;
  });
  Screen.prototype.alloc = function(dirty) {
    var x, y;
    this.lines = [];
    for (y = 0;y < this.rows; y++) {
      this.lines[y] = [];
      for (x = 0;x < this.cols; x++) {
        this.lines[y][x] = [this.dattr, " "];
      }
      this.lines[y].dirty = !!dirty;
    }
    this.olines = [];
    for (y = 0;y < this.rows; y++) {
      this.olines[y] = [];
      for (x = 0;x < this.cols; x++) {
        this.olines[y][x] = [this.dattr, " "];
      }
    }
    this.program.clear();
  };
  Screen.prototype.realloc = function() {
    return this.alloc(true);
  };
  Screen.prototype.render = function() {
    var self = this;
    if (this.destroyed)
      return;
    this.emit("prerender");
    this._borderStops = {};
    this._ci = 0;
    this.children.forEach(function(el) {
      el.index = self._ci++;
      el.render();
    });
    this._ci = -1;
    if (this.screen.dockBorders) {
      this._dockBorders();
    }
    this.draw(0, this.lines.length - 1);
    if (this.focused && this.focused._updateCursor) {
      this.focused._updateCursor(true);
    }
    this.renders++;
    this.emit("render");
  };
  Screen.prototype.blankLine = function(ch, dirty) {
    var out = [];
    for (var x = 0;x < this.cols; x++) {
      out[x] = [this.dattr, ch || " "];
    }
    out.dirty = dirty;
    return out;
  };
  Screen.prototype.insertLine = function(n, y, top, bottom) {
    if (!this.tput.strings.change_scroll_region || !this.tput.strings.delete_line || !this.tput.strings.insert_line)
      return;
    this._buf += this.tput.csr(top, bottom);
    this._buf += this.tput.cup(y, 0);
    this._buf += this.tput.il(n);
    this._buf += this.tput.csr(0, this.height - 1);
    var j = bottom + 1;
    while (n--) {
      this.lines.splice(y, 0, this.blankLine());
      this.lines.splice(j, 1);
      this.olines.splice(y, 0, this.blankLine());
      this.olines.splice(j, 1);
    }
  };
  Screen.prototype.deleteLine = function(n, y, top, bottom) {
    if (!this.tput.strings.change_scroll_region || !this.tput.strings.delete_line || !this.tput.strings.insert_line)
      return;
    this._buf += this.tput.csr(top, bottom);
    this._buf += this.tput.cup(y, 0);
    this._buf += this.tput.dl(n);
    this._buf += this.tput.csr(0, this.height - 1);
    var j = bottom + 1;
    while (n--) {
      this.lines.splice(j, 0, this.blankLine());
      this.lines.splice(y, 1);
      this.olines.splice(j, 0, this.blankLine());
      this.olines.splice(y, 1);
    }
  };
  Screen.prototype.insertLineNC = function(n, y, top, bottom) {
    if (!this.tput.strings.change_scroll_region || !this.tput.strings.delete_line)
      return;
    this._buf += this.tput.csr(top, bottom);
    this._buf += this.tput.cup(top, 0);
    this._buf += this.tput.dl(n);
    this._buf += this.tput.csr(0, this.height - 1);
    var j = bottom + 1;
    while (n--) {
      this.lines.splice(j, 0, this.blankLine());
      this.lines.splice(y, 1);
      this.olines.splice(j, 0, this.blankLine());
      this.olines.splice(y, 1);
    }
  };
  Screen.prototype.deleteLineNC = function(n, y, top, bottom) {
    if (!this.tput.strings.change_scroll_region || !this.tput.strings.delete_line)
      return;
    this._buf += this.tput.csr(top, bottom);
    this._buf += this.tput.cup(bottom, 0);
    this._buf += Array(n + 1).join(`
`);
    this._buf += this.tput.csr(0, this.height - 1);
    var j = bottom + 1;
    while (n--) {
      this.lines.splice(j, 0, this.blankLine());
      this.lines.splice(y, 1);
      this.olines.splice(j, 0, this.blankLine());
      this.olines.splice(y, 1);
    }
  };
  Screen.prototype.insertBottom = function(top, bottom) {
    return this.deleteLine(1, top, top, bottom);
  };
  Screen.prototype.insertTop = function(top, bottom) {
    return this.insertLine(1, top, top, bottom);
  };
  Screen.prototype.deleteBottom = function(top, bottom) {
    return this.clearRegion(0, this.width, bottom, bottom);
  };
  Screen.prototype.deleteTop = function(top, bottom) {
    return this.deleteLine(1, top, top, bottom);
  };
  Screen.prototype.cleanSides = function(el) {
    var pos = el.lpos;
    if (!pos) {
      return false;
    }
    if (pos._cleanSides != null) {
      return pos._cleanSides;
    }
    if (pos.xi <= 0 && pos.xl >= this.width) {
      return pos._cleanSides = true;
    }
    if (this.options.fastCSR) {
      if (pos.yi < 0)
        return pos._cleanSides = false;
      if (pos.yl > this.height)
        return pos._cleanSides = false;
      if (this.width - (pos.xl - pos.xi) < 40) {
        return pos._cleanSides = true;
      }
      return pos._cleanSides = false;
    }
    if (!this.options.smartCSR) {
      return false;
    }
    var yi = pos.yi + el.itop, yl = pos.yl - el.ibottom, first, ch, x, y;
    if (pos.yi < 0)
      return pos._cleanSides = false;
    if (pos.yl > this.height)
      return pos._cleanSides = false;
    if (pos.xi - 1 < 0)
      return pos._cleanSides = true;
    if (pos.xl > this.width)
      return pos._cleanSides = true;
    for (x = pos.xi - 1;x >= 0; x--) {
      if (!this.olines[yi])
        break;
      first = this.olines[yi][x];
      for (y = yi;y < yl; y++) {
        if (!this.olines[y] || !this.olines[y][x])
          break;
        ch = this.olines[y][x];
        if (ch[0] !== first[0] || ch[1] !== first[1]) {
          return pos._cleanSides = false;
        }
      }
    }
    for (x = pos.xl;x < this.width; x++) {
      if (!this.olines[yi])
        break;
      first = this.olines[yi][x];
      for (y = yi;y < yl; y++) {
        if (!this.olines[y] || !this.olines[y][x])
          break;
        ch = this.olines[y][x];
        if (ch[0] !== first[0] || ch[1] !== first[1]) {
          return pos._cleanSides = false;
        }
      }
    }
    return pos._cleanSides = true;
  };
  Screen.prototype._dockBorders = function() {
    var lines = this.lines, stops = this._borderStops, i, y, x, ch;
    stops = Object.keys(stops).map(function(k) {
      return +k;
    }).sort(function(a, b) {
      return a - b;
    });
    for (i = 0;i < stops.length; i++) {
      y = stops[i];
      if (!lines[y])
        continue;
      for (x = 0;x < this.width; x++) {
        ch = lines[y][x][1];
        if (angles[ch]) {
          lines[y][x][1] = this._getAngle(lines, x, y);
          lines[y].dirty = true;
        }
      }
    }
  };
  Screen.prototype._getAngle = function(lines, x, y) {
    var angle = 0, attr = lines[y][x][0], ch = lines[y][x][1];
    if (lines[y][x - 1] && langles[lines[y][x - 1][1]]) {
      if (!this.options.ignoreDockContrast) {
        if (lines[y][x - 1][0] !== attr)
          return ch;
      }
      angle |= 1 << 3;
    }
    if (lines[y - 1] && uangles[lines[y - 1][x][1]]) {
      if (!this.options.ignoreDockContrast) {
        if (lines[y - 1][x][0] !== attr)
          return ch;
      }
      angle |= 1 << 2;
    }
    if (lines[y][x + 1] && rangles[lines[y][x + 1][1]]) {
      if (!this.options.ignoreDockContrast) {
        if (lines[y][x + 1][0] !== attr)
          return ch;
      }
      angle |= 1 << 1;
    }
    if (lines[y + 1] && dangles[lines[y + 1][x][1]]) {
      if (!this.options.ignoreDockContrast) {
        if (lines[y + 1][x][0] !== attr)
          return ch;
      }
      angle |= 1 << 0;
    }
    return angleTable[angle] || ch;
  };
  Screen.prototype.draw = function(start, end) {
    var x, y, line, out, ch, data, attr, fg, bg, flags;
    var main = "", pre, post;
    var clr, neq, xx;
    var lx = -1, ly = -1, o;
    var acs;
    if (this._buf) {
      main += this._buf;
      this._buf = "";
    }
    for (y = start;y <= end; y++) {
      line = this.lines[y];
      o = this.olines[y];
      if (!line.dirty && !(this.cursor.artificial && y === this.program.y)) {
        continue;
      }
      line.dirty = false;
      out = "";
      attr = this.dattr;
      for (x = 0;x < line.length; x++) {
        data = line[x][0];
        ch = line[x][1];
        if (this.cursor.artificial && !this.cursor._hidden && this.cursor._state && x === this.program.x && y === this.program.y) {
          var cattr = this._cursorAttr(this.cursor, data);
          if (cattr.ch)
            ch = cattr.ch;
          data = cattr.attr;
        }
        if (this.options.useBCE && ch === " " && (this.tput.bools.back_color_erase || (data & 511) === (this.dattr & 511)) && (data >> 18 & 8) === (this.dattr >> 18 & 8)) {
          clr = true;
          neq = false;
          for (xx = x;xx < line.length; xx++) {
            if (line[xx][0] !== data || line[xx][1] !== " ") {
              clr = false;
              break;
            }
            if (line[xx][0] !== o[xx][0] || line[xx][1] !== o[xx][1]) {
              neq = true;
            }
          }
          if (clr && neq) {
            lx = -1, ly = -1;
            if (data !== attr) {
              out += this.codeAttr(data);
              attr = data;
            }
            out += this.tput.cup(y, x);
            out += this.tput.el();
            for (xx = x;xx < line.length; xx++) {
              o[xx][0] = data;
              o[xx][1] = " ";
            }
            break;
          }
        }
        if (data === o[x][0] && ch === o[x][1]) {
          if (lx === -1) {
            lx = x;
            ly = y;
          }
          continue;
        } else if (lx !== -1) {
          if (this.tput.strings.parm_right_cursor) {
            out += y === ly ? this.tput.cuf(x - lx) : this.tput.cup(y, x);
          } else {
            out += this.tput.cup(y, x);
          }
          lx = -1, ly = -1;
        }
        o[x][0] = data;
        o[x][1] = ch;
        if (data !== attr) {
          if (attr !== this.dattr) {
            out += "\x1B[m";
          }
          if (data !== this.dattr) {
            out += "\x1B[";
            bg = data & 511;
            fg = data >> 9 & 511;
            flags = data >> 18;
            if (flags & 1) {
              out += "1;";
            }
            if (flags & 2) {
              out += "4;";
            }
            if (flags & 4) {
              out += "5;";
            }
            if (flags & 8) {
              out += "7;";
            }
            if (flags & 16) {
              out += "8;";
            }
            if (bg !== 511) {
              bg = this._reduceColor(bg);
              if (bg < 16) {
                if (bg < 8) {
                  bg += 40;
                } else if (bg < 16) {
                  bg -= 8;
                  bg += 100;
                }
                out += bg + ";";
              } else {
                out += "48;5;" + bg + ";";
              }
            }
            if (fg !== 511) {
              fg = this._reduceColor(fg);
              if (fg < 16) {
                if (fg < 8) {
                  fg += 30;
                } else if (fg < 16) {
                  fg -= 8;
                  fg += 90;
                }
                out += fg + ";";
              } else {
                out += "38;5;" + fg + ";";
              }
            }
            if (out[out.length - 1] === ";")
              out = out.slice(0, -1);
            out += "m";
          }
        }
        if (this.fullUnicode) {
          if (unicode.charWidth(line[x][1]) === 2) {
            if (x === line.length - 1 || angles[line[x + 1][1]]) {
              ch = " ";
              o[x][1] = "\x00";
            } else {
              o[x][1] = "\x00";
              o[++x][1] = "\x00";
            }
          }
        }
        if (this.tput.strings.enter_alt_charset_mode && !this.tput.brokenACS && (this.tput.acscr[ch] || acs)) {
          if (this.tput.acscr[ch]) {
            if (acs) {
              ch = this.tput.acscr[ch];
            } else {
              ch = this.tput.smacs() + this.tput.acscr[ch];
              acs = true;
            }
          } else if (acs) {
            ch = this.tput.rmacs() + ch;
            acs = false;
          }
        } else {
          if (!this.tput.unicode && this.tput.numbers.U8 !== 1 && ch > "~") {
            ch = this.tput.utoa[ch] || "?";
          }
        }
        out += ch;
        attr = data;
      }
      if (attr !== this.dattr) {
        out += "\x1B[m";
      }
      if (out) {
        main += this.tput.cup(y, 0) + out;
      }
    }
    if (acs) {
      main += this.tput.rmacs();
      acs = false;
    }
    if (main) {
      pre = "";
      post = "";
      pre += this.tput.sc();
      post += this.tput.rc();
      if (!this.program.cursorHidden) {
        pre += this.tput.civis();
        post += this.tput.cnorm();
      }
      this.program._write(pre + main + post);
    }
  };
  Screen.prototype._reduceColor = function(color) {
    return colors.reduce(color, this.tput.colors);
  };
  Screen.prototype.attrCode = function(code, cur, def) {
    var flags = cur >> 18 & 511, fg = cur >> 9 & 511, bg = cur & 511, c, i;
    code = code.slice(2, -1).split(";");
    if (!code[0])
      code[0] = "0";
    for (i = 0;i < code.length; i++) {
      c = +code[i] || 0;
      switch (c) {
        case 0:
          bg = def & 511;
          fg = def >> 9 & 511;
          flags = def >> 18 & 511;
          break;
        case 1:
          flags |= 1;
          break;
        case 22:
          flags = def >> 18 & 511;
          break;
        case 4:
          flags |= 2;
          break;
        case 24:
          flags = def >> 18 & 511;
          break;
        case 5:
          flags |= 4;
          break;
        case 25:
          flags = def >> 18 & 511;
          break;
        case 7:
          flags |= 8;
          break;
        case 27:
          flags = def >> 18 & 511;
          break;
        case 8:
          flags |= 16;
          break;
        case 28:
          flags = def >> 18 & 511;
          break;
        case 39:
          fg = def >> 9 & 511;
          break;
        case 49:
          bg = def & 511;
          break;
        case 100:
          fg = def >> 9 & 511;
          bg = def & 511;
          break;
        default:
          if (c === 48 && +code[i + 1] === 5) {
            i += 2;
            bg = +code[i];
            break;
          } else if (c === 48 && +code[i + 1] === 2) {
            i += 2;
            bg = colors.match(+code[i], +code[i + 1], +code[i + 2]);
            if (bg === -1)
              bg = def & 511;
            i += 2;
            break;
          } else if (c === 38 && +code[i + 1] === 5) {
            i += 2;
            fg = +code[i];
            break;
          } else if (c === 38 && +code[i + 1] === 2) {
            i += 2;
            fg = colors.match(+code[i], +code[i + 1], +code[i + 2]);
            if (fg === -1)
              fg = def >> 9 & 511;
            i += 2;
            break;
          }
          if (c >= 40 && c <= 47) {
            bg = c - 40;
          } else if (c >= 100 && c <= 107) {
            bg = c - 100;
            bg += 8;
          } else if (c === 49) {
            bg = def & 511;
          } else if (c >= 30 && c <= 37) {
            fg = c - 30;
          } else if (c >= 90 && c <= 97) {
            fg = c - 90;
            fg += 8;
          } else if (c === 39) {
            fg = def >> 9 & 511;
          } else if (c === 100) {
            fg = def >> 9 & 511;
            bg = def & 511;
          }
          break;
      }
    }
    return flags << 18 | fg << 9 | bg;
  };
  Screen.prototype.codeAttr = function(code) {
    var flags = code >> 18 & 511, fg = code >> 9 & 511, bg = code & 511, out = "";
    if (flags & 1) {
      out += "1;";
    }
    if (flags & 2) {
      out += "4;";
    }
    if (flags & 4) {
      out += "5;";
    }
    if (flags & 8) {
      out += "7;";
    }
    if (flags & 16) {
      out += "8;";
    }
    if (bg !== 511) {
      bg = this._reduceColor(bg);
      if (bg < 16) {
        if (bg < 8) {
          bg += 40;
        } else if (bg < 16) {
          bg -= 8;
          bg += 100;
        }
        out += bg + ";";
      } else {
        out += "48;5;" + bg + ";";
      }
    }
    if (fg !== 511) {
      fg = this._reduceColor(fg);
      if (fg < 16) {
        if (fg < 8) {
          fg += 30;
        } else if (fg < 16) {
          fg -= 8;
          fg += 90;
        }
        out += fg + ";";
      } else {
        out += "38;5;" + fg + ";";
      }
    }
    if (out[out.length - 1] === ";")
      out = out.slice(0, -1);
    return "\x1B[" + out + "m";
  };
  Screen.prototype.focusOffset = function(offset) {
    var shown = this.keyable.filter(function(el) {
      return !el.detached && el.visible;
    }).length;
    if (!shown || !offset) {
      return;
    }
    var i = this.keyable.indexOf(this.focused);
    if (!~i)
      return;
    if (offset > 0) {
      while (offset--) {
        if (++i > this.keyable.length - 1)
          i = 0;
        if (this.keyable[i].detached || !this.keyable[i].visible)
          offset++;
      }
    } else {
      offset = -offset;
      while (offset--) {
        if (--i < 0)
          i = this.keyable.length - 1;
        if (this.keyable[i].detached || !this.keyable[i].visible)
          offset++;
      }
    }
    return this.keyable[i].focus();
  };
  Screen.prototype.focusPrev = Screen.prototype.focusPrevious = function() {
    return this.focusOffset(-1);
  };
  Screen.prototype.focusNext = function() {
    return this.focusOffset(1);
  };
  Screen.prototype.focusPush = function(el) {
    if (!el)
      return;
    var old = this.history[this.history.length - 1];
    if (this.history.length === 10) {
      this.history.shift();
    }
    this.history.push(el);
    this._focus(el, old);
  };
  Screen.prototype.focusPop = function() {
    var old = this.history.pop();
    if (this.history.length) {
      this._focus(this.history[this.history.length - 1], old);
    }
    return old;
  };
  Screen.prototype.saveFocus = function() {
    return this._savedFocus = this.focused;
  };
  Screen.prototype.restoreFocus = function() {
    if (!this._savedFocus)
      return;
    this._savedFocus.focus();
    delete this._savedFocus;
    return this.focused;
  };
  Screen.prototype.rewindFocus = function() {
    var old = this.history.pop(), el;
    while (this.history.length) {
      el = this.history.pop();
      if (!el.detached && el.visible) {
        this.history.push(el);
        this._focus(el, old);
        return el;
      }
    }
    if (old) {
      old.emit("blur");
    }
  };
  Screen.prototype._focus = function(self, old) {
    var el = self;
    while (el = el.parent) {
      if (el.scrollable)
        break;
    }
    if (el && !el.detached) {
      var visible = self.screen.height - el.atop - el.itop - el.abottom - el.ibottom;
      if (self.rtop < el.childBase) {
        el.scrollTo(self.rtop);
        self.screen.render();
      } else if (self.rtop + self.height - self.ibottom > el.childBase + visible) {
        el.scrollTo(self.rtop - (el.height - self.height) + el.itop, true);
        self.screen.render();
      }
    }
    if (old) {
      old.emit("blur", self);
    }
    self.emit("focus", old);
  };
  Screen.prototype.__defineGetter__("focused", function() {
    return this.history[this.history.length - 1];
  });
  Screen.prototype.__defineSetter__("focused", function(el) {
    return this.focusPush(el);
  });
  Screen.prototype.clearRegion = function(xi, xl, yi, yl, override) {
    return this.fillRegion(this.dattr, " ", xi, xl, yi, yl, override);
  };
  Screen.prototype.fillRegion = function(attr, ch, xi, xl, yi, yl, override) {
    var lines = this.lines, cell, xx;
    if (xi < 0)
      xi = 0;
    if (yi < 0)
      yi = 0;
    for (;yi < yl; yi++) {
      if (!lines[yi])
        break;
      for (xx = xi;xx < xl; xx++) {
        cell = lines[yi][xx];
        if (!cell)
          break;
        if (override || attr !== cell[0] || ch !== cell[1]) {
          lines[yi][xx][0] = attr;
          lines[yi][xx][1] = ch;
          lines[yi].dirty = true;
        }
      }
    }
  };
  Screen.prototype.key = function() {
    return this.program.key.apply(this, arguments);
  };
  Screen.prototype.onceKey = function() {
    return this.program.onceKey.apply(this, arguments);
  };
  Screen.prototype.unkey = Screen.prototype.removeKey = function() {
    return this.program.unkey.apply(this, arguments);
  };
  Screen.prototype.spawn = function(file, args, options) {
    if (!Array.isArray(args)) {
      options = args;
      args = [];
    }
    var screen = this, program2 = screen.program, spawn = __require("child_process").spawn, mouse = program2.mouseEnabled, ps;
    options = options || {};
    options.stdio = options.stdio || "inherit";
    program2.lsaveCursor("spawn");
    program2.normalBuffer();
    program2.showCursor();
    if (mouse)
      program2.disableMouse();
    var write = program2.output.write;
    program2.output.write = function() {};
    program2.input.pause();
    if (program2.input.setRawMode) {
      program2.input.setRawMode(false);
    }
    var resume = function() {
      if (resume.done)
        return;
      resume.done = true;
      if (program2.input.setRawMode) {
        program2.input.setRawMode(true);
      }
      program2.input.resume();
      program2.output.write = write;
      program2.alternateBuffer();
      if (mouse) {
        program2.enableMouse();
        if (screen.options.sendFocus) {
          screen.program.setMouse({ sendFocus: true }, true);
        }
      }
      screen.alloc();
      screen.render();
      screen.program.lrestoreCursor("spawn", true);
    };
    ps = spawn(file, args, options);
    ps.on("error", resume);
    ps.on("exit", resume);
    return ps;
  };
  Screen.prototype.exec = function(file, args, options, callback) {
    var ps = this.spawn(file, args, options);
    ps.on("error", function(err) {
      if (!callback)
        return;
      return callback(err, false);
    });
    ps.on("exit", function(code) {
      if (!callback)
        return;
      return callback(null, code === 0);
    });
    return ps;
  };
  Screen.prototype.readEditor = function(options, callback) {
    if (typeof options === "string") {
      options = { editor: options };
    }
    if (!callback) {
      callback = options;
      options = null;
    }
    if (!callback) {
      callback = function() {};
    }
    options = options || {};
    var self = this, editor = options.editor || process.env.EDITOR || "vi", name = options.name || process.title || "blessed", rnd = Math.random().toString(36).split(".").pop(), file = "/tmp/" + name + "." + rnd, args = [file], opt;
    opt = {
      stdio: "inherit",
      env: process.env,
      cwd: process.env.HOME
    };
    function writeFile(callback2) {
      if (!options.value)
        return callback2();
      return fs.writeFile(file, options.value, callback2);
    }
    return writeFile(function(err) {
      if (err)
        return callback(err);
      return self.exec(editor, args, opt, function(err2, success) {
        if (err2)
          return callback(err2);
        return fs.readFile(file, "utf8", function(err3, data) {
          return fs.unlink(file, function() {
            if (!success)
              return callback(new Error("Unsuccessful."));
            if (err3)
              return callback(err3);
            return callback(null, data);
          });
        });
      });
    });
  };
  Screen.prototype.displayImage = function(file, callback) {
    if (!file) {
      if (!callback)
        return;
      return callback(new Error("No image."));
    }
    file = path.resolve(process.cwd(), file);
    if (!~file.indexOf("://")) {
      file = "file://" + file;
    }
    var args = ["w3m", "-T", "text/html"];
    var input = "<title>press q to exit</title>" + '<img align="center" src="' + file + '">';
    var opt = {
      stdio: ["pipe", 1, 2],
      env: process.env,
      cwd: process.env.HOME
    };
    var ps = this.spawn(args[0], args.slice(1), opt);
    ps.on("error", function(err) {
      if (!callback)
        return;
      return callback(err);
    });
    ps.on("exit", function(code) {
      if (!callback)
        return;
      if (code !== 0)
        return callback(new Error("Exit Code: " + code));
      return callback(null, code === 0);
    });
    ps.stdin.write(input + `
`);
    ps.stdin.end();
  };
  Screen.prototype.setEffects = function(el, fel, over, out, effects, temp) {
    if (!effects)
      return;
    var tmp = {};
    if (temp)
      el[temp] = tmp;
    if (typeof el !== "function") {
      var _el = el;
      el = function() {
        return _el;
      };
    }
    fel.on(over, function() {
      var element = el();
      Object.keys(effects).forEach(function(key) {
        var val = effects[key];
        if (val !== null && typeof val === "object") {
          tmp[key] = tmp[key] || {};
          Object.keys(val).forEach(function(k) {
            var v = val[k];
            tmp[key][k] = element.style[key][k];
            element.style[key][k] = v;
          });
          return;
        }
        tmp[key] = element.style[key];
        element.style[key] = val;
      });
      element.screen.render();
    });
    fel.on(out, function() {
      var element = el();
      Object.keys(effects).forEach(function(key) {
        var val = effects[key];
        if (val !== null && typeof val === "object") {
          tmp[key] = tmp[key] || {};
          Object.keys(val).forEach(function(k) {
            if (tmp[key].hasOwnProperty(k)) {
              element.style[key][k] = tmp[key][k];
            }
          });
          return;
        }
        if (tmp.hasOwnProperty(key)) {
          element.style[key] = tmp[key];
        }
      });
      element.screen.render();
    });
  };
  Screen.prototype.sigtstp = function(callback) {
    var self = this;
    this.program.sigtstp(function() {
      self.alloc();
      self.render();
      self.program.lrestoreCursor("pause", true);
      if (callback)
        callback();
    });
  };
  Screen.prototype.copyToClipboard = function(text) {
    return this.program.copyToClipboard(text);
  };
  Screen.prototype.cursorShape = function(shape, blink) {
    var self = this;
    this.cursor.shape = shape || "block";
    this.cursor.blink = blink || false;
    this.cursor._set = true;
    if (this.cursor.artificial) {
      if (!this.program.hideCursor_old) {
        var hideCursor = this.program.hideCursor;
        this.program.hideCursor_old = this.program.hideCursor;
        this.program.hideCursor = function() {
          hideCursor.call(self.program);
          self.cursor._hidden = true;
          if (self.renders)
            self.render();
        };
      }
      if (!this.program.showCursor_old) {
        var showCursor = this.program.showCursor;
        this.program.showCursor_old = this.program.showCursor;
        this.program.showCursor = function() {
          self.cursor._hidden = false;
          if (self.program._exiting)
            showCursor.call(self.program);
          if (self.renders)
            self.render();
        };
      }
      if (!this._cursorBlink) {
        this._cursorBlink = setInterval(function() {
          if (!self.cursor.blink)
            return;
          self.cursor._state ^= 1;
          if (self.renders)
            self.render();
        }, 500);
        if (this._cursorBlink.unref) {
          this._cursorBlink.unref();
        }
      }
      return true;
    }
    return this.program.cursorShape(this.cursor.shape, this.cursor.blink);
  };
  Screen.prototype.cursorColor = function(color) {
    this.cursor.color = color != null ? colors.convert(color) : null;
    this.cursor._set = true;
    if (this.cursor.artificial) {
      return true;
    }
    return this.program.cursorColor(colors.ncolors[this.cursor.color]);
  };
  Screen.prototype.cursorReset = Screen.prototype.resetCursor = function() {
    this.cursor.shape = "block";
    this.cursor.blink = false;
    this.cursor.color = null;
    this.cursor._set = false;
    if (this.cursor.artificial) {
      this.cursor.artificial = false;
      if (this.program.hideCursor_old) {
        this.program.hideCursor = this.program.hideCursor_old;
        delete this.program.hideCursor_old;
      }
      if (this.program.showCursor_old) {
        this.program.showCursor = this.program.showCursor_old;
        delete this.program.showCursor_old;
      }
      if (this._cursorBlink) {
        clearInterval(this._cursorBlink);
        delete this._cursorBlink;
      }
      return true;
    }
    return this.program.cursorReset();
  };
  Screen.prototype._cursorAttr = function(cursor, dattr) {
    var attr = dattr || this.dattr, cattr, ch;
    if (cursor.shape === "line") {
      attr &= ~(511 << 9);
      attr |= 7 << 9;
      ch = "\u2502";
    } else if (cursor.shape === "underline") {
      attr &= ~(511 << 9);
      attr |= 7 << 9;
      attr |= 2 << 18;
    } else if (cursor.shape === "block") {
      attr &= ~(511 << 9);
      attr |= 7 << 9;
      attr |= 8 << 18;
    } else if (typeof cursor.shape === "object" && cursor.shape) {
      cattr = Element.prototype.sattr.call(cursor, cursor.shape);
      if (cursor.shape.bold || cursor.shape.underline || cursor.shape.blink || cursor.shape.inverse || cursor.shape.invisible) {
        attr &= ~(511 << 18);
        attr |= (cattr >> 18 & 511) << 18;
      }
      if (cursor.shape.fg) {
        attr &= ~(511 << 9);
        attr |= (cattr >> 9 & 511) << 9;
      }
      if (cursor.shape.bg) {
        attr &= ~(511 << 0);
        attr |= cattr & 511;
      }
      if (cursor.shape.ch) {
        ch = cursor.shape.ch;
      }
    }
    if (cursor.color != null) {
      attr &= ~(511 << 9);
      attr |= cursor.color << 9;
    }
    return {
      ch,
      attr
    };
  };
  Screen.prototype.screenshot = function(xi, xl, yi, yl, term) {
    if (xi == null)
      xi = 0;
    if (xl == null)
      xl = this.cols;
    if (yi == null)
      yi = 0;
    if (yl == null)
      yl = this.rows;
    if (xi < 0)
      xi = 0;
    if (yi < 0)
      yi = 0;
    var x, y, line, out, ch, data, attr;
    var sdattr = this.dattr;
    if (term) {
      this.dattr = term.defAttr;
    }
    var main = "";
    for (y = yi;y < yl; y++) {
      line = term ? term.lines[y] : this.lines[y];
      if (!line)
        break;
      out = "";
      attr = this.dattr;
      for (x = xi;x < xl; x++) {
        if (!line[x])
          break;
        data = line[x][0];
        ch = line[x][1];
        if (data !== attr) {
          if (attr !== this.dattr) {
            out += "\x1B[m";
          }
          if (data !== this.dattr) {
            var _data = data;
            if (term) {
              if ((_data >> 9 & 511) === 257)
                _data |= 511 << 9;
              if ((_data & 511) === 256)
                _data |= 511;
            }
            out += this.codeAttr(_data);
          }
        }
        if (this.fullUnicode) {
          if (unicode.charWidth(line[x][1]) === 2) {
            if (x === xl - 1) {
              ch = " ";
            } else {
              x++;
            }
          }
        }
        out += ch;
        attr = data;
      }
      if (attr !== this.dattr) {
        out += "\x1B[m";
      }
      if (out) {
        main += (y > 0 ? `
` : "") + out;
      }
    }
    main = main.replace(/(?:\s*\x1b\[40m\s*\x1b\[m\s*)*$/, "") + `
`;
    if (term) {
      this.dattr = sdattr;
    }
    return main;
  };
  Screen.prototype._getPos = function() {
    return this;
  };
  var angles = {
    "\u2518": true,
    "\u2510": true,
    "\u250C": true,
    "\u2514": true,
    "\u253C": true,
    "\u251C": true,
    "\u2524": true,
    "\u2534": true,
    "\u252C": true,
    "\u2502": true,
    "\u2500": true
  };
  var langles = {
    "\u250C": true,
    "\u2514": true,
    "\u253C": true,
    "\u251C": true,
    "\u2534": true,
    "\u252C": true,
    "\u2500": true
  };
  var uangles = {
    "\u2510": true,
    "\u250C": true,
    "\u253C": true,
    "\u251C": true,
    "\u2524": true,
    "\u252C": true,
    "\u2502": true
  };
  var rangles = {
    "\u2518": true,
    "\u2510": true,
    "\u253C": true,
    "\u2524": true,
    "\u2534": true,
    "\u252C": true,
    "\u2500": true
  };
  var dangles = {
    "\u2518": true,
    "\u2514": true,
    "\u253C": true,
    "\u251C": true,
    "\u2524": true,
    "\u2534": true,
    "\u2502": true
  };
  var angleTable = {
    "0000": "",
    "0001": "\u2502",
    "0010": "\u2500",
    "0011": "\u250C",
    "0100": "\u2502",
    "0101": "\u2502",
    "0110": "\u2514",
    "0111": "\u251C",
    "1000": "\u2500",
    "1001": "\u2510",
    "1010": "\u2500",
    "1011": "\u252C",
    "1100": "\u2518",
    "1101": "\u2524",
    "1110": "\u2534",
    "1111": "\u253C"
  };
  Object.keys(angleTable).forEach(function(key) {
    angleTable[parseInt(key, 2)] = angleTable[key];
    delete angleTable[key];
  });
  module.exports = Screen;
});

// node_modules/neo-blessed/lib/helpers.js
var require_helpers = __commonJS((exports) => {
  var fs = __require("fs");
  var unicode = require_unicode();
  var helpers = exports;
  helpers.merge = function(a, b) {
    Object.keys(b).forEach(function(key) {
      a[key] = b[key];
    });
    return a;
  };
  helpers.asort = function(obj) {
    return obj.sort(function(a, b) {
      a = a.name.toLowerCase();
      b = b.name.toLowerCase();
      if (a[0] === "." && b[0] === ".") {
        a = a[1];
        b = b[1];
      } else {
        a = a[0];
        b = b[0];
      }
      return a > b ? 1 : a < b ? -1 : 0;
    });
  };
  helpers.hsort = function(obj) {
    return obj.sort(function(a, b) {
      return b.index - a.index;
    });
  };
  helpers.findFile = function(start, target) {
    return function read(dir) {
      var files, file, stat, out;
      if (dir === "/dev" || dir === "/sys" || dir === "/proc" || dir === "/net") {
        return null;
      }
      try {
        files = fs.readdirSync(dir);
      } catch (e) {
        files = [];
      }
      for (var i = 0;i < files.length; i++) {
        file = files[i];
        if (file === target) {
          return (dir === "/" ? "" : dir) + "/" + file;
        }
        try {
          stat = fs.lstatSync((dir === "/" ? "" : dir) + "/" + file);
        } catch (e) {
          stat = null;
        }
        if (stat && stat.isDirectory() && !stat.isSymbolicLink()) {
          out = read((dir === "/" ? "" : dir) + "/" + file);
          if (out)
            return out;
        }
      }
      return null;
    }(start);
  };
  helpers.escape = function(text) {
    return text.replace(/[{}]/g, function(ch) {
      return ch === "{" ? "{open}" : "{close}";
    });
  };
  helpers.parseTags = function(text, screen) {
    return helpers.Element.prototype._parseTags.call({ parseTags: true, screen: screen || helpers.Screen.global }, text);
  };
  helpers.generateTags = function(style, text) {
    var open = "", close = "";
    Object.keys(style || {}).forEach(function(key) {
      var val = style[key];
      if (typeof val === "string") {
        val = val.replace(/^light(?!-)/, "light-");
        val = val.replace(/^bright(?!-)/, "bright-");
        open = "{" + val + "-" + key + "}" + open;
        close += "{/" + val + "-" + key + "}";
      } else {
        if (val === true) {
          open = "{" + key + "}" + open;
          close += "{/" + key + "}";
        }
      }
    });
    if (text != null) {
      return open + text + close;
    }
    return {
      open,
      close
    };
  };
  helpers.attrToBinary = function(style, element) {
    return helpers.Element.prototype.sattr.call(element || {}, style);
  };
  helpers.stripTags = function(text) {
    if (!text)
      return "";
    return text.replace(/{(\/?)([\w\-,;!#]*)}/g, "").replace(/\x1b\[[\d;]*m/g, "");
  };
  helpers.cleanTags = function(text) {
    return helpers.stripTags(text).trim();
  };
  helpers.dropUnicode = function(text) {
    if (!text)
      return "";
    return text.replace(unicode.chars.all, "??").replace(unicode.chars.combining, "").replace(unicode.chars.surrogate, "?");
  };
  helpers.__defineGetter__("Screen", function() {
    if (!helpers._screen) {
      helpers._screen = require_screen();
    }
    return helpers._screen;
  });
  helpers.__defineGetter__("Element", function() {
    if (!helpers._element) {
      helpers._element = require_element();
    }
    return helpers._element;
  });
});

// node_modules/neo-blessed/lib/blessed.js
var require_blessed = __commonJS((exports, module) => {
  function blessed() {
    return blessed.program.apply(null, arguments);
  }
  blessed.program = blessed.Program = require_program();
  blessed.tput = blessed.Tput = require_tput();
  blessed.widget = require_widget();
  blessed.colors = require_colors();
  blessed.unicode = require_unicode();
  blessed.helpers = require_helpers();
  blessed.helpers.sprintf = blessed.tput.sprintf;
  blessed.helpers.tryRead = blessed.tput.tryRead;
  blessed.helpers.merge(blessed, blessed.helpers);
  blessed.helpers.merge(blessed, blessed.widget);
  module.exports = blessed;
});

// src/tmux-overview.ts
var import_neo_blessed = __toESM(require_blessed(), 1);
import { existsSync } from "fs";
import { appendFile, readFile } from "fs/promises";
import { join, resolve } from "path";
var sessionName = Bun.argv[2] ?? "ainm-tripletex-sessions";
var refreshMs = Math.max(Number(Bun.argv[3] ?? 2000), 500);
var repoRoot = resolve(import.meta.dir, "..");
var productionRunsDir = join(repoRoot, "data", "production", "runs");
var testingRunsDir = join(repoRoot, "data", "testing", "runs");
var showHistory = true;
function runCommand(args) {
  const proc = Bun.spawnSync(args, {
    stderr: "pipe",
    stdout: "pipe"
  });
  return {
    code: proc.exitCode,
    stderr: new TextDecoder().decode(proc.stderr).trim(),
    stdout: new TextDecoder().decode(proc.stdout)
  };
}
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return;
  }
}
function detectRunId(windowName) {
  if (windowName.endsWith("-reflect"))
    return { phase: "reflect", runId: windowName.slice(0, -8) };
  if (windowName.endsWith("-score-review"))
    return { phase: "score", runId: windowName.slice(0, -13) };
  if (windowName.startsWith("prod-") || windowName.startsWith("test-"))
    return { phase: "solve", runId: windowName };
  return;
}
function resolveRunDir(runId) {
  if (runId.startsWith("prod-"))
    return join(productionRunsDir, runId);
  if (runId.startsWith("test-"))
    return join(testingRunsDir, runId);
  return;
}
function parseTaskNumber(taskId) {
  const value = Number(taskId);
  return Number.isFinite(value) ? value : null;
}
function taskTier(taskId) {
  const n = parseTaskNumber(taskId);
  if (n === null)
    return "-";
  if (n <= 8)
    return "T1";
  if (n <= 18)
    return "T2";
  if (n <= 30)
    return "T3";
  return "-";
}
function taskMaxScore(taskId) {
  const tier = taskTier(taskId);
  if (tier === "T1")
    return 2;
  if (tier === "T2")
    return 4;
  if (tier === "T3")
    return 6;
  return null;
}
function formatScoreValue(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
function leaderboardBestScore(taskId, leaderboard) {
  if (!leaderboard || !Array.isArray(leaderboard.entries))
    return null;
  const entry = leaderboard.entries.find((item) => {
    if (!item || typeof item !== "object")
      return false;
    const record = item;
    return String(record.tx_task_id ?? "") === taskId;
  });
  return typeof entry?.best_score === "number" ? entry.best_score : null;
}
function compactStatus(status) {
  if (status === "running")
    return "run";
  if (status === "exited")
    return "exit";
  if (status === "completed")
    return "done";
  if (status === "timed_out")
    return "tout";
  if (status === "launched")
    return "boot";
  if (status === "skipped")
    return "skip";
  if (status === "missing")
    return "miss";
  if (status === "pending")
    return "pend";
  if (status === "killed")
    return "kill";
  return status.slice(0, 4);
}
function compactRunLabel(runId, phase) {
  const match = /^(prod|test)-\d{4}-\d{2}-\d{2}-(\d{6})\d{3}Z-[a-z0-9]{8}$/i.exec(runId);
  const id = match ? `${match[1] === "prod" ? "p" : "t"}${match[2]}` : runId;
  return `${id} ${phase === "solve" ? "run" : phase}`;
}
function isLiveRow(row) {
  if (row.dead)
    return false;
  if (row.phase === "solve")
    return row.solveStatus === "running";
  if (row.phase === "reflect")
    return row.runtimeStatus === "running";
  if (row.phase === "score")
    return row.scoreStatus === "launched" && row.runtimeStatus === "running";
  return false;
}
function statusColor(status) {
  if (status === "running" || status === "completed")
    return "green";
  if (status === "timed_out" || status === "missing" || status === "killed")
    return "red";
  if (status === "launched" || status === "pending")
    return "cyan";
  if (status === "skipped" || status === "exited")
    return "gray";
  return "yellow";
}
function scoreColor(score) {
  if (score === "-" || score === "skipped" || score === "pending")
    return "gray";
  if (score === "100%")
    return "green";
  if (score === "0%")
    return "red";
  return "yellow";
}
function attrLabel(raw) {
  if (!raw || raw === "-")
    return { color: "gray", text: "-" };
  if (raw === "unique_attempt_delta" || raw === "single_new_submission")
    return { color: "green", text: "sure" };
  if (raw.includes("ambiguous"))
    return { color: "yellow", text: "maybe" };
  if (raw.includes("timeout") || raw.includes("missing"))
    return { color: "red", text: "bad" };
  return { color: "yellow", text: raw.replaceAll("_", ".") };
}
function formatCell(text, width) {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, " ");
}
function markup(text, color, bold) {
  let value = text;
  if (color)
    value = `{${color}-fg}${value}{/${color}-fg}`;
  if (bold)
    value = `{bold}${value}{/bold}`;
  return value;
}
async function loadWindows() {
  const result = runCommand([
    "tmux",
    "list-windows",
    "-t",
    sessionName,
    "-F",
    "#{window_index}\t#{window_name}\t#{window_active}\t#{pane_dead}"
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr || "tmux list-windows failed");
  }
  return result.stdout.split(`
`).filter(Boolean).map((line) => {
    const [index, name, active, dead] = line.split("\t");
    return {
      active: active === "1",
      dead: dead === "1",
      index: Number(index),
      name: name ?? ""
    };
  }).sort((a, b) => a.index - b.index);
}
async function summarizeWindow(window) {
  const meta = detectRunId(window.name);
  if (!meta)
    return;
  const runDir = resolveRunDir(meta.runId);
  if (!runDir || !existsSync(runDir)) {
    return {
      active: window.active,
      attributionStatus: "-",
      bestScore: "-",
      correctness: "-",
      dead: window.dead,
      fileCount: null,
      phase: meta.phase,
      reflectionStatus: "-",
      runtimeStatus: "-",
      runId: meta.runId,
      runScore: "-",
      scoreStatus: "-",
      solveStatus: "missing",
      taskId: "-",
      windowIndex: window.index
    };
  }
  const [
    manifest,
    agentStatus,
    reflectionStatus,
    runtimeStatus,
    scoreReflectionStatus,
    submissionScore,
    taskAttribution,
    leaderboardAfter,
    leaderboardBefore
  ] = await Promise.all([
    readJson(join(runDir, "manifest.json")),
    readJson(join(runDir, "agent-run.status.json")),
    readJson(join(runDir, "codex-reflection.status.json")),
    readJson(join(runDir, "codex-reflection.runtime-status.json")),
    readJson(join(runDir, "codex-score-reflection.status.json")),
    readJson(join(runDir, "submission-score.json")),
    readJson(join(runDir, "task-attribution.json")),
    readJson(join(runDir, "leaderboard.after.json")),
    readJson(join(runDir, "leaderboard.before.json"))
  ]);
  const taskId = typeof taskAttribution?.tx_task_id === "string" || typeof taskAttribution?.tx_task_id === "number" ? String(taskAttribution.tx_task_id) : "-";
  const best = leaderboardBestScore(taskId, leaderboardAfter) ?? leaderboardBestScore(taskId, leaderboardBefore);
  const max = taskMaxScore(taskId);
  return {
    active: window.active,
    attributionStatus: typeof taskAttribution?.inference_status === "string" ? taskAttribution.inference_status : typeof taskAttribution?.status === "string" ? taskAttribution.status : "-",
    dead: window.dead,
    bestScore: typeof best === "number" && typeof max === "number" ? `${formatScoreValue(best)}/${max}` : "-",
    correctness: typeof submissionScore?.correctness === "number" ? `${Math.round(submissionScore.correctness * 100)}%` : typeof submissionScore?.status === "string" ? submissionScore.status : "-",
    fileCount: Array.isArray(manifest?.attachments) ? manifest.attachments.length : null,
    phase: meta.phase,
    reflectionStatus: typeof reflectionStatus?.status === "string" ? reflectionStatus.status : "-",
    runtimeStatus: typeof runtimeStatus?.status === "string" ? runtimeStatus.status : "-",
    runId: meta.runId,
    runScore: typeof submissionScore?.score_raw === "number" && typeof submissionScore?.score_max === "number" ? `${submissionScore.score_raw}/${submissionScore.score_max}` : "-",
    scoreStatus: typeof scoreReflectionStatus?.status === "string" ? scoreReflectionStatus.status : "-",
    solveStatus: typeof agentStatus?.status === "string" ? agentStatus.status : "pending",
    taskId,
    windowIndex: window.index
  };
}
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const taskA = parseTaskNumber(a.taskId);
    const taskB = parseTaskNumber(b.taskId);
    if (taskA !== null || taskB !== null) {
      if (taskA === null)
        return 1;
      if (taskB === null)
        return -1;
      if (taskA !== taskB)
        return taskA - taskB;
    }
    if (isLiveRow(a) !== isLiveRow(b))
      return isLiveRow(a) ? -1 : 1;
    if (a.active !== b.active)
      return a.active ? -1 : 1;
    return a.windowIndex - b.windowIndex;
  });
}
function postStatusForRow(row) {
  if (row.phase === "score")
    return row.scoreStatus;
  return row.reflectionStatus;
}
function rowMarkup(row) {
  const attr = attrLabel(row.attributionStatus);
  const mainStatus = row.solveStatus;
  const postStatus = postStatusForRow(row);
  const cells = [
    formatCell(String(row.windowIndex), 3),
    formatCell(row.phase === "solve" ? "S" : row.phase === "reflect" ? "R" : "$", 1),
    markup(formatCell(compactStatus(mainStatus), 4), statusColor(mainStatus)),
    markup(formatCell(compactStatus(postStatus), 4), statusColor(postStatus)),
    markup(formatCell(row.correctness.replace("%", ""), 5), scoreColor(row.correctness)),
    formatCell(row.runScore, 5),
    formatCell(row.taskId, 4),
    formatCell(taskTier(row.taskId), 4),
    formatCell(row.bestScore, 5),
    formatCell(row.fileCount === null ? "-" : String(row.fileCount), 2),
    markup(formatCell(attr.text, 6), attr.color),
    formatCell(compactRunLabel(row.runId, row.phase), 16)
  ];
  return cells.join(" ");
}
function buildHistoryText(historyRows) {
  const grouped = new Map;
  for (const row of historyRows) {
    const key = row.taskId === "-" ? "unknown" : row.taskId;
    const arr = grouped.get(key);
    if (arr)
      arr.push(row);
    else
      grouped.set(key, [row]);
  }
  const lines = [];
  for (const [taskId, rows] of grouped) {
    lines.push(markup(`task ${taskId}  ${taskTier(taskId)}  best ${rows[0]?.bestScore ?? "-"}  n=${rows.length}`, "yellow", true));
    for (const row of rows)
      lines.push(rowMarkup(row));
    lines.push("");
  }
  return lines.join(`
`);
}
var screen = import_neo_blessed.default.screen({
  smartCSR: true,
  title: `tripletex overview: ${sessionName}`
});
var header = import_neo_blessed.default.box({
  parent: screen,
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  border: "line",
  label: " status ",
  style: {
    border: { fg: "cyan" }
  }
});
var liveBox = import_neo_blessed.default.box({
  parent: screen,
  top: 3,
  left: 0,
  width: "100%",
  height: "45%",
  tags: true,
  border: "line",
  label: " live ",
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: {
    ch: " ",
    inverse: true
  },
  style: {
    border: { fg: "green" }
  }
});
var historyBox = import_neo_blessed.default.box({
  parent: screen,
  top: "48%",
  left: 0,
  width: "100%",
  height: "52%-1",
  tags: true,
  border: "line",
  label: " history ",
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: {
    ch: " ",
    inverse: true
  },
  style: {
    border: { fg: "yellow" }
  }
});
async function refresh() {
  try {
    const windows = await loadWindows();
    const rows = sortRows((await Promise.all(windows.map((window) => summarizeWindow(window)))).filter(Boolean));
    const liveRows = rows.filter(isLiveRow);
    const historyRows = rows.filter((row) => !isLiveRow(row));
    const active = windows.find((window) => window.active)?.name ?? "-";
    const runningMain = rows.filter((row) => row.phase === "solve" && row.solveStatus === "running").length;
    const runningFollow = rows.filter((row) => row.phase !== "solve" && row.reflectionStatus === "running").length;
    header.setContent([
      `${markup("tripletex", "cyan", true)} ${sessionName} ${new Date().toISOString()}`,
      `win ${windows.length}  main ${markup(`${runningMain}/8`, runningMain >= 8 ? "red" : "green")}  follow ${markup(String(runningFollow), runningFollow > 0 ? "yellow" : "gray")}  active ${markup(active, "white", true)}`
    ].join(`
`));
    const tableHeader = `${formatCell("#", 3)} ${formatCell("P", 1)} ${formatCell("main", 4)} ${formatCell("post", 4)} ${formatCell("pct", 5)} ${formatCell("scr", 5)} ${formatCell("task", 4)} ${formatCell("tier", 4)} ${formatCell("best", 5)} ${formatCell("f", 2)} ${formatCell("attr", 6)} run`;
    liveBox.setContent([tableHeader, ...liveRows.map(rowMarkup)].join(`
`));
    historyBox.setContent(buildHistoryText(historyRows) || "{gray-fg}no history{/gray-fg}");
    historyBox.hidden = !showHistory;
    screen.render();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendFile("/tmp/tripletex-tmux-overview.error.log", `${new Date().toISOString()} ${message}
`).catch(() => {});
    header.setContent(`${markup("tripletex", "red", true)} error
${message}`);
    liveBox.setContent("");
    historyBox.setContent("");
    screen.render();
  }
}
screen.key(["q", "C-c"], () => process.exit(0));
screen.key(["h"], () => {
  showHistory = !showHistory;
  screen.render();
});
screen.key(["tab"], () => {
  if (screen.focused === liveBox)
    historyBox.focus();
  else
    liveBox.focus();
});
liveBox.focus();
await refresh();
var timer = setInterval(() => {
  refresh();
}, refreshMs);
process.on("exit", () => clearInterval(timer));
