import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/open_doc.dart';
import '../providers.dart';
import 'home.dart';
import 'widgets.dart';

class LearnTab extends StatelessWidget {
  const LearnTab({super.key});
  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(children: const [
        TabBar(tabs: [Tab(text: 'Videos'), Tab(text: 'PDFs & guides')]),
        Expanded(child: TabBarView(children: [VideosBody(), ResourcesBody()])),
      ]),
    );
  }
}

class VideosScreen extends StatelessWidget {
  const VideosScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Videos')), body: const SafeArea(child: VideosBody()));
}

class ResourcesScreen extends StatelessWidget {
  const ResourcesScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('PDFs & guides')), body: const SafeArea(child: ResourcesBody()));
}

class VideosBody extends ConsumerWidget {
  const VideosBody({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(videosProvider.future),
      child: AsyncBody<List<dynamic>>(
        value: ref.watch(videosProvider),
        onRetry: () => ref.invalidate(videosProvider),
        builder: (items) => items.isEmpty
            ? ListView(children: const [Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No videos yet. Please check back soon.')))])
            : ListView(padding: const EdgeInsets.all(14), children: [for (final v in items) VideoTile(video: Map<String, dynamic>.from(v as Map))]),
      ),
    );
  }
}

class ResourcesBody extends ConsumerWidget {
  const ResourcesBody({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(resourcesProvider.future),
      child: AsyncBody<List<dynamic>>(
        value: ref.watch(resourcesProvider),
        onRetry: () => ref.invalidate(resourcesProvider),
        builder: (items) => items.isEmpty
            ? ListView(children: const [Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No guides yet. Please check back soon.')))])
            : ListView(padding: const EdgeInsets.all(14), children: [for (final r in items) ResourceTile(item: Map<String, dynamic>.from(r as Map))]),
      ),
    );
  }
}

class VideoTile extends StatelessWidget {
  const VideoTile({super.key, required this.video});
  final Map<String, dynamic> video;
  @override
  Widget build(BuildContext context) {
    final locked = video['locked'] == true;
    final thumb = video['thumbnailUrl'] as String?;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          if (locked) {
            _lockedDialog(context);
          } else {
            openUrl(context, video['videoUrl'] as String?);
          }
        },
        child: Row(children: [
          SizedBox(
            width: 120, height: 80,
            child: Stack(fit: StackFit.expand, children: [
              thumb == null ? const ColoredBox(color: Color(0xFF1D3350), child: Icon(Icons.play_circle_fill, size: 36)) : CachedNetworkImage(imageUrl: thumb, fit: BoxFit.cover, errorWidget: (_, __, ___) => const ColoredBox(color: Color(0xFF1D3350))),
              if (locked) const ColoredBox(color: Colors.black54, child: Icon(Icons.lock)),
            ]),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(video['title'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(locked ? 'For support members' : 'Free', style: TextStyle(fontSize: 12, color: locked ? const Color(0xFFFFB703) : const Color(0xFF7BE0A6))),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class ResourceTile extends StatelessWidget {
  const ResourceTile({super.key, required this.item});
  final Map<String, dynamic> item;
  @override
  Widget build(BuildContext context) {
    final locked = item['locked'] == true;
    final isPdf = item['type'] == 'pdf';
    return Card(
      child: ListTile(
        leading: Icon(locked ? Icons.lock : (isPdf ? Icons.picture_as_pdf : Icons.article)),
        title: Text(item['title'] as String? ?? ''),
        subtitle: Text(locked ? 'For support members' : ((item['summary'] as String?)?.isNotEmpty ?? false) ? item['summary'] as String : (isPdf ? 'PDF' : 'Guide'), maxLines: 2, overflow: TextOverflow.ellipsis),
        onTap: () {
          if (locked) {
            _lockedDialog(context);
          } else if (isPdf) {
            openDocument(context, item['fileUrl'] as String?, title: item['title'] as String?);
          } else {
            context.push('/resource', extra: item);
          }
        },
      ),
    );
  }
}

class ResourceDetailScreen extends StatelessWidget {
  const ResourceDetailScreen({super.key, required this.item});
  final Map<String, dynamic> item;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(item['title'] as String? ?? '')),
        body: SafeArea(child: SingleChildScrollView(padding: const EdgeInsets.all(18), child: SelectableText(item['body'] as String? ?? '', style: const TextStyle(fontSize: 16, height: 1.5)))),
      );
}

void _lockedDialog(BuildContext context) {
  showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      title: const Text('Members only'),
      content: const Text('This content is included with a Support plan.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () {
            Navigator.pop(context);
            context.push('/plans');
          },
          child: const Text('See plans'),
        ),
      ],
    ),
  );
}
