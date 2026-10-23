import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

const _imageExt = {'jpg', 'jpeg', 'png', 'webp', 'gif'};

String _extFor(String url, String? contentType) {
  final path = Uri.tryParse(url)?.path.toLowerCase() ?? '';
  final dot = path.lastIndexOf('.');
  if (dot != -1 && path.length - dot <= 6) return path.substring(dot + 1);
  final ct = (contentType ?? '').toLowerCase();
  if (ct.contains('pdf')) return 'pdf';
  if (ct.contains('png')) return 'png';
  if (ct.contains('webp')) return 'webp';
  if (ct.contains('jpeg') || ct.contains('jpg')) return 'jpg';
  return 'bin';
}

/// Downloads a PDF/image and opens it directly: PDFs in the phone's PDF app, images in a
/// full-screen viewer. The link is never shown to the user.
Future<void> openDocument(BuildContext context, String? url, {String? title}) async {
  final uri = url == null ? null : Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') {
    _msg(context, 'This file is not available.');
    return;
  }
  final nav = Navigator.of(context, rootNavigator: true);
  final messenger = ScaffoldMessenger.of(context);
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const PopScope(canPop: false, child: Center(child: Card(child: Padding(padding: EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [CircularProgressIndicator(), SizedBox(height: 14), Text('Opening…')]))))),
  );
  try {
    final dir = await getTemporaryDirectory();
    final probe = _extFor(url!, null);
    final res = await Dio().get<List<int>>(url, options: Options(responseType: ResponseType.bytes, receiveTimeout: const Duration(minutes: 3)));
    final ext = probe == 'bin' ? _extFor(url, res.headers.value('content-type')) : probe;
    final file = File('${dir.path}/doc_${url.hashCode.abs()}.$ext');
    await file.writeAsBytes(res.data ?? const [], flush: true);
    nav.pop();
    if (!context.mounted) return;
    if (_imageExt.contains(ext)) {
      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ImageViewerScreen(file: file, title: title ?? '')));
    } else {
      final r = await OpenFilex.open(file.path);
      if (r.type != ResultType.done) {
        messenger.showSnackBar(const SnackBar(content: Text('No app found to open this file. Please install a PDF reader.')));
      }
    }
  } catch (_) {
    if (nav.canPop()) nav.pop();
    messenger.showSnackBar(const SnackBar(content: Text('Could not open the file. Check your internet and try again.')));
  }
}

void _msg(BuildContext c, String m) => ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m)));

class ImageViewerScreen extends StatelessWidget {
  const ImageViewerScreen({super.key, required this.file, required this.title});
  final File file;
  final String title;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        backgroundColor: Colors.black,
        body: SafeArea(child: Center(child: InteractiveViewer(minScale: 1, maxScale: 5, child: Image.file(file, fit: BoxFit.contain)))),
      );
}
