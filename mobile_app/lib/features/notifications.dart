import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/format.dart';
import '../providers.dart';
import 'widgets.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => ref.refresh(notificationsProvider.future),
          child: AsyncBody<Map<String, dynamic>>(
            value: ref.watch(notificationsProvider),
            onRetry: () => ref.invalidate(notificationsProvider),
            builder: (d) {
              final items = (d['items'] as List).cast<Map<String, dynamic>>();
              if (items.isEmpty) return ListView(children: const [Padding(padding: EdgeInsets.all(40), child: Center(child: Text('No notifications yet.')))]);
              return ListView(children: [
                for (final n in items)
                  ListTile(
                    leading: Icon(n['isRead'] == true ? Icons.notifications_none : Icons.notifications_active, color: n['isRead'] == true ? null : const Color(0xFFFFB703)),
                    title: Text(n['title'] as String, style: TextStyle(fontWeight: n['isRead'] == true ? FontWeight.w400 : FontWeight.w700)),
                    subtitle: Text('${n['body']}\n${dateOnly(n['createdAt'])}'),
                    isThreeLine: true,
                    onTap: () async {
                      if (n['isRead'] != true) {
                        try {
                          await ref.read(apiProvider).post('/notifications/${n['id']}/read');
                          ref.invalidate(notificationsProvider);
                        } catch (_) {}
                      }
                    },
                  ),
              ]);
            },
          ),
        ),
      ),
    );
  }
}
