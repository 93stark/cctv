import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers.dart';
import 'account.dart';
import 'learn.dart';
import 'support.dart';
import 'widgets.dart';

Future<void> openUrl(BuildContext context, String? url) async {
  final uri = url == null ? null : Uri.tryParse(url);
  if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http' || uri.scheme == 'tel')) {
    snack(context, 'This link is not available.');
    return;
  }
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) snack(context, 'Could not open the link.');
}

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _i = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [const HomeTab(), const LearnTab(), const SupportTab(), const AccountTab()];
    return Scaffold(
      body: SafeArea(child: pages[_i]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i,
        onDestinationSelected: (i) => setState(() => _i = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.play_circle_outline), selectedIcon: Icon(Icons.play_circle), label: 'Learn'),
          NavigationDestination(icon: Icon(Icons.support_agent_outlined), selectedIcon: Icon(Icons.support_agent), label: 'Support'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}

class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(homeProvider);
    final name = (ref.watch(authProvider).profile['fullName'] as String?) ?? '';
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(homeProvider.future),
      child: AsyncBody<Map<String, dynamic>>(
        value: home,
        onRetry: () => ref.invalidate(homeProvider),
        builder: (d) {
          final banners = (d['banners'] as List).cast<Map<String, dynamic>>();
          final booksRaw = d['books'];
          final books = booksRaw is List
              ? booksRaw.map((e) => Map<String, dynamic>.from(e as Map)).toList()
              : <Map<String, dynamic>>[if (d['book'] is Map) Map<String, dynamic>.from(d['book'] as Map)];
          final videos = (d['freeVideos'] as List).cast<Map<String, dynamic>>();
          final resources = (d['resources'] as List).cast<Map<String, dynamic>>();
          final promo = (d['promoText'] as String?) ?? '';
          return ListView(padding: const EdgeInsets.all(16), children: [
            Row(children: [
              Expanded(child: Text(name.isEmpty ? 'Hello!' : 'Hello, ${name.split(' ').first}!', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))),
              IconButton(onPressed: () => context.push('/notifications'), icon: const Icon(Icons.notifications_none)),
            ]),
            if (promo.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(promo, style: const TextStyle(color: Color(0xFFFFB703)))),
            if (banners.isNotEmpty) BannerCarousel(banners: banners),
            const SizedBox(height: 16),
            for (final b in books) _BookCard(book: b),
            const SizedBox(height: 18),
            _SectionHeader(title: 'Free videos', onMore: () => context.push('/videos')),
            if (videos.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('New videos are coming soon.', style: TextStyle(color: Color(0xFF9FB2CC)))),
            for (final v in videos) VideoTile(video: v),
            const SizedBox(height: 12),
            _SectionHeader(title: 'PDFs & guides', onMore: () => context.push('/resources')),
            if (resources.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('Guides will appear here.', style: TextStyle(color: Color(0xFF9FB2CC)))),
            for (final r in resources) ResourceTile(item: r),
          ]);
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.onMore});
  final String title;
  final VoidCallback onMore;
  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
        TextButton(onPressed: onMore, child: const Text('See all')),
      ]);
}

class BannerCarousel extends StatefulWidget {
  const BannerCarousel({super.key, required this.banners});
  final List<Map<String, dynamic>> banners;
  @override
  State<BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<BannerCarousel> {
  final _c = PageController(viewportFraction: 0.94);
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      SizedBox(
        height: 170,
        child: PageView.builder(
          controller: _c,
          itemCount: widget.banners.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (_, i) {
            final b = widget.banners[i];
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: b['destinationUrl'] == null ? null : () => openUrl(context, b['destinationUrl'] as String),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Stack(fit: StackFit.expand, children: [
                    CachedNetworkImage(imageUrl: b['imageUrl'] as String, fit: BoxFit.cover, errorWidget: (_, __, ___) => const ColoredBox(color: Color(0xFF14233A))),
                    const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Colors.black87, Colors.transparent]))),
                    Positioned(
                      left: 14, right: 14, bottom: 12,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text(b['title'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        if ((b['description'] as String?)?.isNotEmpty ?? false) Text(b['description'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                        if (b['buttonText'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Chip(label: Text(b['buttonText'] as String), visualDensity: VisualDensity.compact)),
                      ]),
                    ),
                  ]),
                ),
              ),
            );
          },
        ),
      ),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (var i = 0; i < widget.banners.length; i++)
          Container(margin: const EdgeInsets.all(3), width: i == _page ? 18 : 6, height: 6, decoration: BoxDecoration(color: i == _page ? const Color(0xFF1D8CF0) : Colors.white24, borderRadius: BorderRadius.circular(3))),
      ]),
    ]);
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({required this.book});
  final Map<String, dynamic> book;
  @override
  Widget build(BuildContext context) {
    final cover = book['coverUrl'] as String?;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(width: 72, height: 104, child: cover == null ? const ColoredBox(color: Color(0xFF1D8CF0), child: Icon(Icons.menu_book, size: 34)) : CachedNetworkImage(imageUrl: cover, fit: BoxFit.cover)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(book['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              if (((book['author'] as String?) ?? '').isNotEmpty) Text('by ${book['author']}', style: const TextStyle(color: Color(0xFF9FB2CC))),
              if (((book['description'] as String?) ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(book['description'] as String, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: Color(0xFF9FB2CC)))),
              const SizedBox(height: 10),
              FilledButton.tonal(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                onPressed: () => openUrl(context, (book['buyUrl'] ?? book['amazonUrl']) as String?),
                child: Text((book['buttonText'] as String?) ?? 'Get the book on Amazon', textAlign: TextAlign.center),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
