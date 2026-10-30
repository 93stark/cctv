import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers.dart';
import 'gen.dart';
import 'widgets.dart';

/// One basket line. A line is one item + one chosen variant, so two monitor sizes are two lines.
class CartLine {
  CartLine({required this.key, required this.pkg, required this.name, required this.variant, required this.unit, required this.unitPaise, required this.qty, this.imageUrl});
  final String key;
  final String pkg;
  final String name;
  final String? variant;
  final String unit;
  final int unitPaise;
  int qty;
  final String? imageUrl;
  String get title => variant == null || variant!.isEmpty ? name : '$name - $variant';
}

class _Choice {
  _Choice(this.variant, this.qty);
  final Map<String, dynamic>? variant;
  final int qty;
}

class GenTab extends ConsumerStatefulWidget {
  const GenTab({super.key});
  @override
  ConsumerState<GenTab> createState() => _GenTabState();
}

class _GenTabState extends ConsumerState<GenTab> with TickerProviderStateMixin {
  String? _pkgId;
  final Map<String, CartLine> _cart = {};
  final _name = TextEditingController();
  final _basketKey = GlobalKey();
  late final AnimationController _burstC = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
  List<_Particle> _particles = [];
  bool _hover = false;
  Map<String, dynamic>? _lastData;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _askName();
    });
  }

  /// Asked once each time GEN is opened. Optional: Skip goes straight on.
  Future<void> _askName() async {
    final tmp = TextEditingController(text: _name.text);
    final res = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Customer name'),
        content: TextField(
          controller: tmp,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.done,
          onSubmitted: (v) => Navigator.of(ctx).pop(v.trim()),
          decoration: const InputDecoration(hintText: 'Optional', prefixIcon: Icon(Icons.person_outline)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(''), child: const Text('Skip')),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(96, 44)), onPressed: () => Navigator.of(ctx).pop(tmp.text.trim()), child: const Text('Continue')),
        ],
      ),
    );
    if (mounted) setState(() => _name.text = res ?? '');
  }

  @override
  void dispose() {
    _burstC.dispose();
    _name.dispose();
    super.dispose();
  }

  int get _count => _cart.values.fold(0, (t, l) => t + l.qty);
  int get _total => _cart.values.fold(0, (t, l) => t + l.qty * l.unitPaise);

  String _currentPkgName() {
    for (final p in ((_lastData?['items'] as List?) ?? const []).cast<Map<String, dynamic>>()) {
      if (p['id'] == _pkgId) return p['name'] as String;
    }
    return 'Custom';
  }

  // ---- adding -------------------------------------------------------------

  void _addLine(Map<String, dynamic> item, Map<String, dynamic>? variant, int qty) {
    final variantId = variant?['id'] as String?;
    final key = '${item['id']}|${variantId ?? ''}';
    final price = ((variant ?? item)['unitPricePaise'] as num).toInt();
    final existing = _cart[key];
    setState(() {
      if (existing != null) {
        existing.qty += qty;
      } else {
        _cart[key] = CartLine(
          key: key,
          pkg: _currentPkgName(),
          name: item['name'] as String,
          variant: variant?['label'] as String?,
          unit: (item['unit'] as String?) ?? 'pcs',
          unitPaise: price,
          qty: qty,
          imageUrl: item['imageUrl'] as String?,
        );
      }
    });
  }

  /// Item picked (tap or drop). Items with variants ask which one first, then the item flies into the basket.
  Future<void> _pick(Map<String, dynamic> item, Offset from) async {
    final variants = (item['variants'] as List? ?? const []).cast<Map<String, dynamic>>();
    final defQty = ((item['defaultQty'] as num?)?.toInt() ?? 1).clamp(1, 999).toInt();
    _Choice? choice;
    if (variants.isEmpty) {
      choice = _Choice(null, defQty);
    } else {
      choice = await showModalBottomSheet<_Choice>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _VariantSheet(item: item, variants: variants, defaultQty: defQty),
      );
    }
    if (choice == null || !mounted) return;
    _addLine(item, choice.variant, choice.qty);
    _fly(from, _Thumb(url: item['imageUrl'] as String?, size: 60));
  }

  void _fly(Offset from, Widget thumb) {
    final box = _basketKey.currentContext?.findRenderObject() as RenderBox?;
    final overlay = Overlay.maybeOf(context);
    if (box == null || overlay == null) {
      _burst();
      return;
    }
    final to = box.localToGlobal(box.size.center(Offset.zero)) - const Offset(0, 8);
    final mid = Offset((from.dx + to.dx) / 2, math.min(from.dy, to.dy) - 90);
    final c = AnimationController(vsync: this, duration: const Duration(milliseconds: 680));
    final curve = CurvedAnimation(parent: c, curve: Curves.easeInCubic);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => AnimatedBuilder(
        animation: curve,
        builder: (_, __) {
          final t = curve.value;
          final p = from * ((1 - t) * (1 - t)) + mid * (2 * (1 - t) * t) + to * (t * t);
          return Positioned(
            left: p.dx - 30,
            top: p.dy - 30,
            child: IgnorePointer(
              child: Transform.rotate(
                angle: 0.5 * t,
                child: Transform.scale(scale: 1.0 - 0.6 * t, child: Opacity(opacity: 1 - 0.25 * t, child: thumb)),
              ),
            ),
          );
        },
      ),
    );
    overlay.insert(entry);
    c.forward().whenComplete(() {
      entry.remove();
      c.dispose();
      if (mounted) _burst();
    });
  }

  void _burst() {
    final r = math.Random();
    const colors = [Color(0xFFFFC107), Color(0xFF2563EB), Color(0xFF22D3EE), Color(0xFFEC4899), Color(0xFF34D399), Colors.white];
    _particles = List.generate(
      22,
      (_) => _Particle(angle: r.nextDouble() * math.pi * 2, speed: 40 + r.nextDouble() * 60, size: 3 + r.nextDouble() * 3, color: colors[r.nextInt(colors.length)]),
    );
    _burstC.forward(from: 0);
  }

  // ---- basket sheet ---------------------------------------------------------

  Future<void> _openBasket() async {
    if (_cart.isEmpty) {
      snack(context, 'Basket is empty. Drag or tap an item to add it.');
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) {
          void upd(VoidCallback f) {
            setState(f);
            setS(() {});
            if (_cart.isEmpty) Navigator.of(ctx).pop();
          }

          final lines = _cart.values.toList();
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.75),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(children: [
                      const Text('Your basket', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton(onPressed: () => upd(() => _cart.clear()), child: const Text('Clear all')),
                    ]),
                    Flexible(
                      child: ListView(
                        shrinkWrap: true,
                        children: [
                          for (final l in lines)
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: _Thumb(url: l.imageUrl, size: 44),
                              title: Text(l.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                              subtitle: Text('Rs. ${money(l.unitPaise)} x ${l.qty} = Rs. ${money(l.unitPaise * l.qty)}'),
                              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                                IconButton(
                                  icon: const Icon(Icons.remove_circle_outline),
                                  onPressed: () => upd(() {
                                    l.qty--;
                                    if (l.qty <= 0) _cart.remove(l.key);
                                  }),
                                ),
                                Text('${l.qty}', style: const TextStyle(fontWeight: FontWeight.w700)),
                                IconButton(icon: const Icon(Icons.add_circle_outline), onPressed: l.qty < 999 ? () => upd(() => l.qty++) : null),
                              ]),
                            ),
                        ],
                      ),
                    ),
                    const Divider(),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      const Text('Total', style: TextStyle(fontSize: 16)),
                      Text('Rs. ${money(_total)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    ]),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ---- generate ---------------------------------------------------------------

  Future<void> _generate() async {
    if (_cart.isEmpty) return;
    final data = _lastData;
    final lines = [for (final l in _cart.values) QuoteLine(l.title, l.unit, l.qty, l.unitPaise)];
    final now = DateTime.now();
    final company = ((data?['company'] as Map?)?['name'] as String?) ?? 'Silicon Corporation';
    final pkgs = _cart.values.map((l) => l.pkg).toSet().toList();
    final q = Quotation(
      company: company,
      packageName: pkgs.length == 1 ? pkgs.first : 'Custom Quotation (${pkgs.join(', ')})',
      customer: _name.text.trim(),
      lines: lines,
      number: 'Q${_stamp(now)}',
      date: now,
    );
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black87,
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (ctx, _, __) => _PrintOverlay(total: _total, onDone: () => Navigator.of(ctx).pop()),
    );
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => QuotationPreviewScreen(quotation: q, orderWhatsapp: data?['orderWhatsapp'] as String?)));
  }

  String _stamp(DateTime d) {
    String t(int n) => n.toString().padLeft(2, '0');
    return '${t(d.year % 100)}${t(d.month)}${t(d.day)}-${t(d.hour)}${t(d.minute)}';
  }

  // ---- build ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(quotePackagesProvider);
    return AsyncBody<Map<String, dynamic>>(
      value: value,
      onRetry: () => ref.invalidate(quotePackagesProvider),
      builder: (d) {
        _lastData = d;
        final pkgs = (d['items'] as List).cast<Map<String, dynamic>>();
        if (pkgs.isEmpty) {
          return ListView(padding: const EdgeInsets.all(24), children: const [
            SizedBox(height: 80),
            Icon(Icons.receipt_long_outlined, size: 56),
            SizedBox(height: 12),
            Text('No packages yet', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            SizedBox(height: 6),
            Text('Quotation packages will appear here once they are published.', textAlign: TextAlign.center),
          ]);
        }
        final pkg = pkgs.firstWhere((p) => p['id'] == _pkgId, orElse: () => pkgs.first);
        _pkgId = pkg['id'] as String;
        final items = (pkg['items'] as List).cast<Map<String, dynamic>>();
        final scheme = Theme.of(context).colorScheme;
        final cardW = (MediaQuery.of(context).size.width - 32 - 24) / 4;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(children: [
                Expanded(child: Text('Quotation Generator', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800))),
                IconButton(onPressed: () => ref.invalidate(quotePackagesProvider), icon: const Icon(Icons.refresh), tooltip: 'Refresh'),
              ]),
            ),
            SizedBox(
              height: 52,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                children: [
                  for (final p in pkgs)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(p['name'] as String),
                        selected: p['id'] == _pkgId,
                        onSelected: (_) => setState(() => _pkgId = p['id'] as String),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Row(children: [
                  Expanded(child: Text('Hold and drag an item into the basket, or just tap it.', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12))),
                  GestureDetector(
                    onTap: _askName,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.person_outline, size: 16),
                        const SizedBox(width: 3),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 90),
                          child: Text(_name.text.isEmpty ? 'Add name' : _name.text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: scheme.primary, fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      ]),
                    ),
                  ),
                ]),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async => ref.refresh(quotePackagesProvider.future),
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: items.isEmpty
                      ? const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No items in this package yet.')))
                      : Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [for (final i in items) _itemCard(i, cardW, scheme)],
                        ),
                ),
              ),
            ),
            _basketPanel(scheme),
          ],
        );
      },
    );
  }

  Widget _itemCard(Map<String, dynamic> item, double w, ColorScheme scheme) {
    final variants = (item['variants'] as List? ?? const []).cast<Map<String, dynamic>>();
    final prices = variants.isEmpty ? [(item['unitPricePaise'] as num).toInt()] : variants.map((v) => (v['unitPricePaise'] as num).toInt()).toList();
    final minP = prices.reduce(math.min);
    final label = variants.isEmpty ? 'Rs. ${money(minP)}' : 'from Rs. ${money(minP)}';
    Widget face({bool lifted = false}) => Container(
          width: w,
          padding: const EdgeInsets.all(5),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: lifted ? scheme.primary : scheme.outlineVariant),
            boxShadow: lifted ? [BoxShadow(color: scheme.primary.withValues(alpha: 0.5), blurRadius: 18)] : null,
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Stack(clipBehavior: Clip.none, children: [
              _Thumb(url: item['imageUrl'] as String?, size: w - 10),
              Positioned(
                right: -2,
                top: -2,
                child: CircleAvatar(radius: 8, backgroundColor: scheme.primary, child: const Icon(Icons.add, size: 12, color: Colors.white)),
              ),
            ]),
            const SizedBox(height: 4),
            Text(item['name'] as String, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 10.5, height: 1.15)),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 9.5)),
          ]),
        );

    return Builder(
      builder: (ctx) {
        Offset center() {
          final box = ctx.findRenderObject() as RenderBox;
          return box.localToGlobal(box.size.center(Offset.zero));
        }

        return LongPressDraggable<Map<String, dynamic>>(
          data: item,
          delay: const Duration(milliseconds: 180),
          hapticFeedbackOnStart: true,
          dragAnchorStrategy: pointerDragAnchorStrategy,
          feedback: Transform.translate(
            offset: Offset(-w / 2, -w / 2),
            child: Material(color: Colors.transparent, child: Transform.rotate(angle: -0.06, child: Transform.scale(scale: 1.35, child: face(lifted: true)))),
          ),
          childWhenDragging: Opacity(opacity: 0.3, child: face()),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => _pick(item, center()),
            child: face(),
          ),
        );
      },
    );
  }

  Widget _basketPanel(ColorScheme scheme) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border(top: BorderSide(color: _hover ? scheme.primary : scheme.outlineVariant, width: _hover ? 2 : 1)),
      ),
      child: Row(
        children: [
          DragTarget<Map<String, dynamic>>(
            onMove: (_) {
              if (!_hover) setState(() => _hover = true);
            },
            onLeave: (_) {
              if (_hover) setState(() => _hover = false);
            },
            onAcceptWithDetails: (d) {
              setState(() => _hover = false);
              _pick(d.data, d.offset);
            },
            builder: (_, __, ___) => GestureDetector(
              onTap: _openBasket,
              child: AnimatedBuilder(
                animation: _burstC,
                builder: (_, __) {
                  final t = _burstC.value;
                  final bounce = 1 + 0.12 * math.sin(math.pi * t) + (_hover ? 0.08 : 0);
                  return SizedBox(
                    key: _basketKey,
                    width: 124,
                    height: 104,
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: 110,
                          height: 80,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            boxShadow: [BoxShadow(color: (_hover ? scheme.primary : Colors.transparent).withValues(alpha: 0.55), blurRadius: 34, spreadRadius: 4)],
                          ),
                        ),
                        Transform.scale(scale: bounce, child: CustomPaint(size: const Size(112, 92), painter: _BasketPainter(filled: _count.clamp(0, 3).toInt()))),
                        if (t > 0 && t < 1) Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _BurstPainter(_particles, t)))),
                        Positioned(
                          right: 0,
                          top: 0,
                          child: AnimatedScale(
                            scale: _count > 0 ? 1.0 : 0.0,
                            duration: const Duration(milliseconds: 250),
                            curve: Curves.elasticOut,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: scheme.primary, borderRadius: BorderRadius.circular(12)),
                              child: Text('$_count', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_count == 0 ? 'Basket is empty' : '$_count item${_count == 1 ? '' : 's'} in basket', style: TextStyle(color: scheme.onSurfaceVariant)),
                const SizedBox(height: 2),
                Text('Rs. ${money(_total)}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  onPressed: _count == 0 ? null : _generate,
                  icon: const Icon(Icons.print_outlined),
                  label: const Text('Generate'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url, required this.size});
  final String? url;
  final double size;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fallback = ColoredBox(color: scheme.surfaceContainerHighest, child: Icon(Icons.videocam_outlined, size: size * 0.5));
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: size,
        height: size,
        child: url != null && url!.isNotEmpty ? CachedNetworkImage(imageUrl: url!, fit: BoxFit.cover, errorWidget: (_, __, ___) => fallback, placeholder: (_, __) => fallback) : fallback,
      ),
    );
  }
}

class _VariantSheet extends StatefulWidget {
  const _VariantSheet({required this.item, required this.variants, required this.defaultQty});
  final Map<String, dynamic> item;
  final List<Map<String, dynamic>> variants;
  final int defaultQty;
  @override
  State<_VariantSheet> createState() => _VariantSheetState();
}

class _VariantSheetState extends State<_VariantSheet> {
  Map<String, dynamic>? _v;
  late int _qty = widget.defaultQty;

  @override
  void initState() {
    super.initState();
    if (widget.variants.length == 1) _v = widget.variants.first;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final unit = (widget.item['unit'] as String?) ?? 'pcs';
    final total = _v == null ? 0 : (_v!['unitPricePaise'] as num).toInt() * _qty;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _Thumb(url: widget.item['imageUrl'] as String?, size: 56),
              const SizedBox(width: 12),
              Expanded(child: Text(widget.item['name'] as String, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
            ]),
            const SizedBox(height: 14),
            Text('Choose an option', style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final v in widget.variants)
                  ChoiceChip(
                    label: Text('${v['label']}  ·  Rs. ${money((v['unitPricePaise'] as num).toInt())}'),
                    selected: _v?['id'] == v['id'],
                    onSelected: (_) => setState(() => _v = v),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Row(children: [
              Text(unit == 'pcs' ? 'Quantity' : 'Quantity ($unit)'),
              const Spacer(),
              IconButton.filledTonal(onPressed: _qty > 1 ? () => setState(() => _qty--) : null, icon: const Icon(Icons.remove)),
              SizedBox(width: 48, child: Text('$_qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
              IconButton.filledTonal(onPressed: _qty < 999 ? () => setState(() => _qty++) : null, icon: const Icon(Icons.add)),
            ]),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _v == null ? null : () => Navigator.of(context).pop(_Choice(_v, _qty)),
              icon: const Icon(Icons.shopping_basket_outlined),
              label: Text(_v == null ? 'Choose an option' : 'Add to basket  ·  Rs. ${money(total)}'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BasketPainter extends CustomPainter {
  _BasketPainter({required this.filled});
  final int filled;

  @override
  void paint(Canvas canvas, Size s) {
    final w = s.width, h = s.height;
    const brown = Color(0xFFB07A3E);
    const dark = Color(0xFF7A4E1D);
    final handle = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..color = dark;
    canvas.drawArc(Rect.fromLTWH(w * 0.22, h * 0.02, w * 0.56, h * 0.6), math.pi, math.pi, false, handle);
    // things peeking out of the basket
    const peek = [Color(0xFF2563EB), Color(0xFF22D3EE), Color(0xFFFFC107)];
    for (var i = 0; i < filled; i++) {
      final r = RRect.fromRectAndRadius(Rect.fromLTWH(w * (0.2 + 0.22 * i), h * (0.2 + (i.isOdd ? 0.05 : 0)), w * 0.24, h * 0.3), const Radius.circular(6));
      canvas.drawRRect(r, Paint()..color = peek[i % peek.length]);
    }
    final body = Path()
      ..moveTo(w * 0.04, h * 0.38)
      ..lineTo(w * 0.96, h * 0.38)
      ..lineTo(w * 0.82, h * 0.96)
      ..quadraticBezierTo(w * 0.8, h, w * 0.76, h)
      ..lineTo(w * 0.24, h)
      ..quadraticBezierTo(w * 0.2, h, w * 0.18, h * 0.96)
      ..close();
    canvas.drawPath(body, Paint()..color = brown);
    canvas.save();
    canvas.clipPath(body);
    final weave = Paint()
      ..color = dark.withValues(alpha: 0.55)
      ..strokeWidth = 2;
    for (var y = h * 0.5; y < h; y += h * 0.14) {
      canvas.drawLine(Offset(0, y), Offset(w, y), weave);
    }
    for (var x = 0.0; x < w; x += w * 0.1) {
      canvas.drawLine(Offset(x, h * 0.38), Offset(x + (x - w / 2) * 0.05, h), weave);
    }
    canvas.restore();
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(0, h * 0.33, w, h * 0.12), const Radius.circular(8)), Paint()..color = dark);
  }

  @override
  bool shouldRepaint(covariant _BasketPainter old) => old.filled != filled;
}

class _Particle {
  _Particle({required this.angle, required this.speed, required this.size, required this.color});
  final double angle;
  final double speed;
  final double size;
  final Color color;
}

class _BurstPainter extends CustomPainter {
  _BurstPainter(this.particles, this.t);
  final List<_Particle> particles;
  final double t;

  @override
  void paint(Canvas canvas, Size s) {
    final c = Offset(s.width / 2, s.height * 0.4);
    final e = Curves.easeOutCubic.transform(t);
    for (final p in particles) {
      final pos = c + Offset(math.cos(p.angle), math.sin(p.angle) - 0.25) * (p.speed * e) + Offset(0, 40 * t * t);
      canvas.drawCircle(pos, p.size * (1 - t), Paint()..color = p.color.withValues(alpha: 1 - t));
    }
  }

  @override
  bool shouldRepaint(covariant _BurstPainter old) => old.t != t;
}

/// Full-screen "printing" moment: a printer slides a paper bill out, then calls onDone.
class _PrintOverlay extends StatefulWidget {
  const _PrintOverlay({required this.total, required this.onDone});
  final int total;
  final VoidCallback onDone;
  @override
  State<_PrintOverlay> createState() => _PrintOverlayState();
}

class _PrintOverlayState extends State<_PrintOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1700));

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(() async {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (mounted) widget.onDone();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      type: MaterialType.transparency,
      child: Center(
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, __) {
            final t = Curves.easeInOut.transform(_c.value);
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 230,
                  height: 84,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF334155), Color(0xFF1E293B)], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: scheme.primary.withValues(alpha: 0.7), width: 1.5),
                    boxShadow: [BoxShadow(color: scheme.primary.withValues(alpha: 0.35), blurRadius: 26)],
                  ),
                  child: Stack(alignment: Alignment.center, children: [
                    const Icon(Icons.print, size: 40, color: Colors.white70),
                    Positioned(bottom: 10, child: Container(width: 170, height: 6, decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(3)))),
                    Positioned(top: 10, right: 14, child: Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: _c.value < 0.95 ? const Color(0xFF34D399) : Colors.white24))),
                  ]),
                ),
                ClipRect(
                  child: SizedBox(
                    width: 230,
                    height: 230,
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: Transform.translate(
                        offset: Offset(0, -220 * (1 - t)),
                        child: Container(
                          width: 180,
                          height: 220,
                          padding: const EdgeInsets.all(14),
                          decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(bottom: Radius.circular(6))),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('QUOTATION', style: TextStyle(color: Color(0xFF2563EB), fontWeight: FontWeight.w800, fontSize: 15)),
                            const SizedBox(height: 10),
                            for (var i = 0; i < 5; i++)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                child: Row(children: [
                                  Expanded(child: Container(height: 6, decoration: BoxDecoration(color: Colors.black12, borderRadius: BorderRadius.circular(3)))),
                                  const SizedBox(width: 10),
                                  Container(width: 28, height: 6, decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(3))),
                                ]),
                              ),
                            const Spacer(),
                            Align(alignment: Alignment.centerRight, child: Text('Rs. ${money(widget.total)}', style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w800, fontSize: 16))),
                          ]),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(_c.value < 0.95 ? 'Generating your quotation...' : 'Ready!', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
              ],
            );
          },
        ),
      ),
    );
  }
}
