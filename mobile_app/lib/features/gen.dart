import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers.dart';
import 'widgets.dart';

/// One line of a quotation. Money is kept in integer paise, so totals never have rounding drift.
class QuoteLine {
  QuoteLine(this.name, this.unit, this.qty, this.unitPaise);
  final String name;
  final String unit;
  final int qty;
  final int unitPaise;
  int get totalPaise => qty * unitPaise;
}

class Quotation {
  Quotation({required this.company, required this.packageName, required this.customer, required this.lines, required this.number, required this.date});
  final String company;
  final String packageName;
  final String customer;
  final List<QuoteLine> lines;
  final String number;
  final DateTime date;
  int get grandPaise => lines.fold(0, (t, l) => t + l.totalPaise);
}

final _inr = NumberFormat.decimalPattern('en_IN');
String _money(int paise) {
  final r = paise / 100;
  return r == r.roundToDouble() ? _inr.format(r.toInt()) : NumberFormat('#,##,##0.00', 'en_IN').format(r);
}

/// The default PDF fonts cannot draw the rupee sign or Devanagari, so the PDF uses "Rs." and plain English text.
String _latin(String s) {
  final t = s.replaceAll(RegExp(r'[^\x20-\x7E]'), '').trim();
  return t.isEmpty ? s : t;
}

String quotationText(Quotation q) {
  final b = StringBuffer()
    ..writeln('*Quotation Request - ${q.company}*')
    ..writeln('Ref: ${q.number}  |  Date: ${DateFormat('d MMM y').format(q.date)}');
  if (q.customer.isNotEmpty) b.writeln('Name: ${q.customer}');
  b
    ..writeln('Package: ${q.packageName}')
    ..writeln();
  var n = 1;
  for (final l in q.lines) {
    b.writeln('${n++}. ${l.name} - ${l.qty} x Rs.${_money(l.unitPaise)} = Rs.${_money(l.totalPaise)}');
  }
  b
    ..writeln()
    ..writeln('*Grand Total: Rs.${_money(q.grandPaise)}*')
    ..writeln()
    ..write('Please confirm availability and the final order.');
  return b.toString();
}

Future<Uint8List> buildQuotationPdf(Quotation q) async {
  final doc = pw.Document(title: 'Quotation ${q.number}', author: q.company);
  const blue = PdfColor.fromInt(0xFF2563EB);
  const grey = PdfColor.fromInt(0xFF64748B);
  pw.Widget cell(String t, {bool bold = false, pw.TextAlign align = pw.TextAlign.left, PdfColor? color}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: pw.Text(t, textAlign: align, style: pw.TextStyle(fontSize: 10, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal, color: color)),
      );
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (_) => [
        pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text(_latin(q.company), style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold, color: blue)),
            pw.Text('CCTV Secret & Entrepreneurship', style: const pw.TextStyle(fontSize: 10, color: grey)),
          ]),
          pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
            pw.Text('QUOTATION', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
            pw.Text('Ref: ${q.number}', style: const pw.TextStyle(fontSize: 10)),
            pw.Text('Date: ${DateFormat('d MMM y').format(q.date)}', style: const pw.TextStyle(fontSize: 10)),
          ]),
        ]),
        pw.SizedBox(height: 16),
        pw.Divider(color: blue, thickness: 1.5),
        if (q.customer.isNotEmpty) pw.Text('Prepared for: ${_latin(q.customer)}', style: const pw.TextStyle(fontSize: 11)),
        pw.Text('Package: ${_latin(q.packageName)}', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 12),
        pw.Table(
          border: pw.TableBorder.all(color: PdfColors.grey400, width: 0.5),
          columnWidths: {
            0: const pw.FixedColumnWidth(28),
            1: const pw.FlexColumnWidth(4),
            2: const pw.FixedColumnWidth(36),
            3: const pw.FixedColumnWidth(78),
            4: const pw.FixedColumnWidth(86),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: blue),
              children: [
                cell('#', bold: true, color: PdfColors.white),
                cell('Item', bold: true, color: PdfColors.white),
                cell('Qty', bold: true, align: pw.TextAlign.center, color: PdfColors.white),
                cell('Unit price', bold: true, align: pw.TextAlign.right, color: PdfColors.white),
                cell('Total', bold: true, align: pw.TextAlign.right, color: PdfColors.white),
              ],
            ),
            for (var i = 0; i < q.lines.length; i++)
              pw.TableRow(children: [
                cell('${i + 1}'),
                cell(_latin(q.lines[i].name)),
                cell('${q.lines[i].qty}', align: pw.TextAlign.center),
                cell('Rs. ${_money(q.lines[i].unitPaise)}', align: pw.TextAlign.right),
                cell('Rs. ${_money(q.lines[i].totalPaise)}', align: pw.TextAlign.right),
              ]),
          ],
        ),
        pw.SizedBox(height: 10),
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Container(
            padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFEFF4FF)),
            child: pw.Text('Grand Total: Rs. ${_money(q.grandPaise)}', style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: blue)),
          ),
        ),
        pw.SizedBox(height: 24),
        pw.Text('This is a system generated quotation. Prices are indicative and subject to confirmation.', style: const pw.TextStyle(fontSize: 9, color: grey)),
      ],
    ),
  );
  return doc.save();
}

Future<File> writeQuotationPdf(Quotation q) async {
  final bytes = await buildQuotationPdf(q);
  final dir = await getTemporaryDirectory();
  final f = File('${dir.path}/Quotation_${q.number}.pdf');
  return f.writeAsBytes(bytes, flush: true);
}

class GenTab extends ConsumerStatefulWidget {
  const GenTab({super.key});
  @override
  ConsumerState<GenTab> createState() => _GenTabState();
}

class _GenTabState extends ConsumerState<GenTab> {
  String? _pkgId;
  final Map<String, int> _qty = {};
  final _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _select(Map<String, dynamic> pkg) {
    _pkgId = pkg['id'] as String;
    _qty.clear();
    for (final i in (pkg['items'] as List).cast<Map<String, dynamic>>()) {
      _qty[i['id'] as String] = (i['defaultQty'] as num?)?.toInt() ?? 1;
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(quotePackagesProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(quotePackagesProvider.future),
      child: AsyncBody<Map<String, dynamic>>(
        value: value,
        onRetry: () => ref.invalidate(quotePackagesProvider),
        builder: (d) {
          final pkgs = (d['items'] as List).cast<Map<String, dynamic>>();
          if (pkgs.isEmpty) {
            return ListView(padding: const EdgeInsets.all(24), children: const [
              SizedBox(height: 80),
              Icon(Icons.receipt_long_outlined, size: 56),
              SizedBox(height: 12),
              Text('No packages yet', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              SizedBox(height: 6),
              Text('Quotation packages will appear here once they are published. Pull down to refresh.', textAlign: TextAlign.center),
            ]);
          }
          Map<String, dynamic> pkg = pkgs.firstWhere((p) => p['id'] == _pkgId, orElse: () => pkgs.first);
          if (pkg['id'] != _pkgId) _select(pkg);
          final items = (pkg['items'] as List).cast<Map<String, dynamic>>();
          int qtyOf(Map<String, dynamic> i) => _qty[i['id']] ?? 0;
          final grand = items.fold<int>(0, (t, i) => t + qtyOf(i) * (i['unitPricePaise'] as num).toInt());
          final scheme = Theme.of(context).colorScheme;

          return ListView(
            padding: const EdgeInsets.all(16),
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              Text('Quotation Generator', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('Pick a package, set quantities and get a ready quotation.', style: TextStyle(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final p in pkgs)
                    ChoiceChip(
                      label: Text(p['name'] as String),
                      selected: p['id'] == pkg['id'],
                      onSelected: (_) => setState(() => _select(p)),
                    ),
                ],
              ),
              if ((pkg['description'] as String? ?? '').isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(pkg['description'] as String, style: TextStyle(color: scheme.onSurfaceVariant)),
              ],
              const SizedBox(height: 12),
              TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Customer name (optional)', prefixIcon: Icon(Icons.person_outline))),
              const SizedBox(height: 12),
              for (final i in items)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(i['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 2),
                            Text('Rs. ${_money((i['unitPricePaise'] as num).toInt())} / ${i['unit']}', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
                            if (qtyOf(i) > 0) Text('Rs. ${_money(qtyOf(i) * (i['unitPricePaise'] as num).toInt())}', style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600)),
                          ]),
                        ),
                        IconButton.filledTonal(
                          onPressed: qtyOf(i) > 0 ? () => setState(() => _qty[i['id'] as String] = qtyOf(i) - 1) : null,
                          icon: const Icon(Icons.remove),
                          tooltip: 'Less',
                        ),
                        SizedBox(width: 36, child: Text('${qtyOf(i)}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                        IconButton.filledTonal(
                          onPressed: qtyOf(i) < 999 ? () => setState(() => _qty[i['id'] as String] = qtyOf(i) + 1) : null,
                          icon: const Icon(Icons.add),
                          tooltip: 'More',
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 4),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Estimated total', style: TextStyle(fontSize: 15)),
                Text('Rs. ${_money(grand)}', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: scheme.primary)),
              ]),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: grand <= 0 && items.every((i) => qtyOf(i) == 0)
                    ? null
                    : () {
                        final lines = [
                          for (final i in items)
                            if (qtyOf(i) > 0) QuoteLine(i['name'] as String, i['unit'] as String? ?? 'pcs', qtyOf(i), (i['unitPricePaise'] as num).toInt()),
                        ];
                        final now = DateTime.now();
                        final company = ((d['company'] as Map?)?['name'] as String?) ?? 'Silicon Corporation';
                        final q = Quotation(
                          company: company,
                          packageName: pkg['name'] as String,
                          customer: _name.text.trim(),
                          lines: lines,
                          number: 'Q${DateFormat('yyMMdd-HHmm').format(now)}',
                          date: now,
                        );
                        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => QuotationPreviewScreen(quotation: q, orderWhatsapp: d['orderWhatsapp'] as String?)));
                      },
                icon: const Icon(Icons.receipt_long),
                label: const Text('Generate Quotation'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class QuotationPreviewScreen extends StatefulWidget {
  const QuotationPreviewScreen({super.key, required this.quotation, required this.orderWhatsapp});
  final Quotation quotation;
  final String? orderWhatsapp;
  @override
  State<QuotationPreviewScreen> createState() => _QuotationPreviewScreenState();
}

class _QuotationPreviewScreenState extends State<QuotationPreviewScreen> {
  bool _busy = false;

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final f = await writeQuotationPdf(widget.quotation);
      await Share.shareXFiles([XFile(f.path, mimeType: 'application/pdf')], subject: 'Quotation ${widget.quotation.number}', text: 'Quotation from ${widget.quotation.company}');
    } catch (_) {
      if (mounted) snack(context, 'Could not create the PDF. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPdf() async {
    setState(() => _busy = true);
    try {
      final f = await writeQuotationPdf(widget.quotation);
      final r = await OpenFilex.open(f.path, type: 'application/pdf');
      if (r.type != ResultType.done && mounted) snack(context, 'No PDF app found. Use Share instead.');
    } catch (_) {
      if (mounted) snack(context, 'Could not open the PDF.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _order() async {
    final digits = (widget.orderWhatsapp ?? '+917797493140').replaceAll(RegExp(r'[^0-9]'), '');
    final uri = Uri.parse('https://wa.me/$digits?text=${Uri.encodeComponent(quotationText(widget.quotation))}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) snack(context, 'Could not open WhatsApp.');
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.quotation;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Quotation Preview'), actions: [IconButton(onPressed: _busy ? null : _openPdf, icon: const Icon(Icons.picture_as_pdf_outlined), tooltip: 'Open PDF')]),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(q.company, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: scheme.primary)),
                        const SizedBox(height: 4),
                        Text('Ref ${q.number}  ·  ${DateFormat('d MMM y').format(q.date)}', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
                        if (q.customer.isNotEmpty) Text('For: ${q.customer}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text(q.packageName, style: const TextStyle(fontWeight: FontWeight.w600)),
                        const Divider(height: 24),
                        Row(children: [
                          const Expanded(flex: 5, child: Text('Item', style: TextStyle(fontWeight: FontWeight.w700))),
                          const SizedBox(width: 30, child: Text('Qty', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700))),
                          const Expanded(flex: 3, child: Text('Unit', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w700))),
                          const Expanded(flex: 3, child: Text('Total', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w700))),
                        ]),
                        const SizedBox(height: 8),
                        for (final l in q.lines)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 5),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Expanded(flex: 5, child: Text(l.name)),
                              SizedBox(width: 30, child: Text('${l.qty}', textAlign: TextAlign.center)),
                              Expanded(flex: 3, child: Text(_money(l.unitPaise), textAlign: TextAlign.right)),
                              Expanded(flex: 3, child: Text(_money(l.totalPaise), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600))),
                            ]),
                          ),
                        const Divider(height: 24),
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          const Text('Grand Total', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          Text('₹${_money(q.grandPaise)}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: scheme.primary)),
                        ]),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('Prices are indicative and subject to confirmation.', textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Row(children: [
                Expanded(child: OutlinedButton.icon(style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)), onPressed: _busy ? null : _share, icon: const Icon(Icons.share), label: const Text('Share'))),
                const SizedBox(width: 12),
                Expanded(child: FilledButton.icon(onPressed: _busy ? null : _order, icon: const Icon(Icons.shopping_cart_checkout), label: const Text('Order'))),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}
